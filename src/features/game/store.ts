/*
 * Estado de la sala y de la mesa de juego.
 *
 * Es una mesa virtual: la web no impone las reglas; cada jugador mueve sus
 * cartas como en una mesa de verdad y se automatiza lo repetitivo (barajar,
 * robar, enderezar al empezar el turno, impuesto de comandante…).
 *
 * Cada jugador solo escribe su propia mesa:
 *   game_public  → lo que ven todos (campo, cementerio, exilio, mando, vida…)
 *   game_private → lo que solo ve él (mano, orden de la biblioteca, boca abajo)
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { create } from 'zustand'
import { sb, errText } from '../../api/supabase'
import { fetchCard } from '../../api/scryfall'
import { useAuth } from '../../auth/useAuth'
import { toast } from '../../lib/toast'
import type { Deck } from '../decks/rules'
import { useDecks } from '../decks/useDecks'
import type {
  LogEntry,
  PrivateState,
  PublicState,
  Room,
  RoomPlayer,
  TCard,
  TokenBase,
  Zone,
} from './types'
import { FROM, HAND_SIZE, START_LIFE, TO, clamp, newIid, plural, randInt, safeImg, shuffle } from './util'

/* ---------- Estado ---------- */

export type MenuItem =
  | '-'
  | { title: string }
  | { counter: string; iid: string }
  | { label: string; fn: () => void }

export interface ViewerState {
  title: string
  hint?: string
  zone: Zone
  owner: boolean
  uid?: string
  /** Mirar las de arriba: solo estas cartas, mientras sigan arriba. */
  topIds?: string[]
  /** Buscar en la biblioteca: se baraja al cerrar. */
  search?: boolean
}

interface GameState {
  room: Room | null
  players: RoomPlayer[]
  practice: boolean
  /** La sala dejó de existir o ya no estás en ella. */
  lost: string
  pub: PublicState | null
  priv: PrivateState | null
  others: Record<string, PublicState>
  log: LogEntry[]
  tableError: string
  save: { text: string; bad?: boolean }
  /** Mesa que se está mirando (null = la mía). */
  view: string | null
  sideHidden: boolean
  unread: number
  menu: { items: MenuItem[]; x: number; y: number } | null
  viewer: ViewerState | null
  /** Ficha de carta abierta (id de Scryfall). */
  detailId: string | null
  tokensOpen: boolean
}

function readSideHidden(): boolean {
  try {
    return localStorage.getItem('cm-juego-chat') === 'oculto'
  } catch {
    return false
  }
}

const initial = {
  room: null,
  players: [],
  practice: false,
  lost: '',
  pub: null,
  priv: null,
  others: {},
  log: [],
  tableError: '',
  save: { text: '' },
  view: null,
  unread: 0,
  menu: null,
  viewer: null,
  detailId: null,
  tokensOpen: false,
}

export const useGame = create<GameState>(() => ({ ...initial, sideHidden: readSideHidden() }))

const get = () => useGame.getState()
const set = useGame.setState

export function myId(): string | null {
  return useAuth.getState().user?.id ?? null
}

function myName(): string {
  return useAuth.getState().profile?.username ?? 'yo'
}

/** Los demás jugadores, empezando por el que va después de mí. */
export function opponents(players: RoomPlayer[], me: string | null): RoomPlayer[] {
  const seats = players.slice().sort((a, b) => a.seat - b.seat)
  const i = seats.findIndex((p) => p.user_id === me)
  return seats
    .slice(i + 1)
    .concat(seats.slice(0, Math.max(i, 0)))
    .filter((p) => p.user_id !== me)
}

/* ---------- Sala: entrar, avisos en tiempo real y salir ---------- */

let channel: RealtimeChannel | null = null
let poll: ReturnType<typeof setInterval> | undefined
let openToken = 0 // descarta aperturas de sala que ya no tocan
let lastTurnKey = ''
let logIds = new Set<string | number>()
let localLog = 0

function stopRoom() {
  if (channel) void sb.removeChannel(channel)
  channel = null
  clearInterval(poll)
  poll = undefined
}

/** Sale de la sala (o de la práctica) y deja el estado limpio. */
export function closeRoom() {
  openToken++
  stopRoom()
  flushStats()
  logIds = new Set()
  set({ ...initial, sideHidden: get().sideHidden })
}

async function fetchRoom(rid: string) {
  const [room, players] = await Promise.all([
    sb.from('rooms').select('*').eq('id', rid).maybeSingle(),
    sb.from('room_players').select('*').eq('room_id', rid).order('seat'),
  ])
  if (room.error || players.error) return { error: true as const }
  return { room: room.data as Room | null, players: players.data as RoomPlayer[] }
}

/** Abre una sala (o la mesa, si la partida está en marcha). */
export async function openRoom(rid: string) {
  if (get().room?.id === rid && channel) return
  closeRoom()
  const mine = openToken
  const r = await fetchRoom(rid)
  if (mine !== openToken) return
  if ('error' in r) {
    set({ lost: 'No se ha podido cargar la sala.' })
    return
  }
  if (!r.room || !r.players.some((p) => p.user_id === myId())) {
    set({ lost: 'Ya no estás en esa sala.' })
    return
  }
  set({ room: r.room, players: r.players })
  subscribeRoom(rid)
  if (r.room.status === 'playing') await enterTable()
}

function subscribeRoom(rid: string) {
  channel = sb
    .channel('sala-' + rid)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'id=eq.' + rid }, (p) => {
      onRoomUpdate(p.new as Room)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: 'room_id=eq.' + rid }, () => {
      void reloadRoom()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_public', filter: 'room_id=eq.' + rid }, (p) => {
      const row = p.new as { user_id?: string; state?: PublicState } | null
      if (row?.user_id) onPublic(row.user_id, row.state ?? null)
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_log', filter: 'room_id=eq.' + rid }, (p) => {
      pushLog(p.new as LogEntry)
    })
    .subscribe()
  // Por si se pierde algún aviso (por ejemplo, alguien sale de la sala).
  poll = setInterval(() => void reloadRoom(), 10000)
}

export async function reloadRoom() {
  const s = get()
  if (!s.room?.id || s.practice) return
  const rid = s.room.id
  const r = await fetchRoom(rid)
  if (get().room?.id !== rid || 'error' in r) return
  if (!r.room || !r.players.some((p) => p.user_id === myId())) {
    closeRoom()
    set({ lost: 'La sala ya no existe o ya no estás en ella.' })
    return
  }
  set({ players: r.players })
  if (r.room.updated_at !== get().room?.updated_at) onRoomUpdate(r.room)
  if (r.room.status === 'playing' && get().pub) void refreshOthers()
}

// Red de seguridad: recarga las mesas de los rivales por si se perdió algún aviso.
async function refreshOthers() {
  const rid = get().room?.id
  const me = myId()
  if (!rid || !me) return
  const r = await sb.from('game_public').select('user_id, state').eq('room_id', rid).neq('user_id', me)
  if (r.error || get().room?.id !== rid) return
  const others = { ...get().others }
  let changed = false
  for (const row of r.data as { user_id: string; state: PublicState }[]) {
    if (JSON.stringify(others[row.user_id]) !== JSON.stringify(row.state)) {
      others[row.user_id] = row.state
      changed = true
    }
  }
  if (changed) set({ others })
}

function onRoomUpdate(r: Room) {
  const prev = get().room
  if (!prev || r.id !== prev.id) return
  set({ room: r })
  if (prev.status !== r.status) {
    if (r.status === 'playing') {
      void enterTable()
      return
    }
    if (get().pub) {
      set({ pub: null, priv: null, viewer: null, menu: null, others: {}, log: [] })
      toast('El anfitrión ha terminado la partida.')
      void reloadRoom()
      return
    }
  }
  if (get().pub) checkTurn()
}

function onPublic(uid: string, state: PublicState | null) {
  if (uid === myId()) return
  if (!state) {
    void refreshOthers()
    return
  }
  set((s) => ({ others: { ...s.others, [uid]: state } }))
}

/* ---------- Entrar a la mesa ---------- */

async function enterTable() {
  const room = get().room
  const me = myId()
  if (!room?.id || !me) return
  const rid = room.id
  logIds = new Set()
  set({ pub: null, priv: null, others: {}, log: [], tableError: '', view: null, unread: 0 })
  const [pubs, priv, log, players] = await Promise.all([
    sb.from('game_public').select('user_id, state').eq('room_id', rid),
    sb.from('game_private').select('state').eq('room_id', rid).eq('user_id', me).maybeSingle(),
    sb.from('game_log').select('*').eq('room_id', rid).order('id', { ascending: false }).limit(200),
    sb.from('room_players').select('*').eq('room_id', rid).order('seat'),
  ])
  if (get().room?.id !== rid) return
  const err = pubs.error || priv.error || log.error || players.error
  if (err) {
    set({ tableError: 'No se ha podido cargar la partida: ' + errText(err) })
    return
  }
  let myPub: PublicState | null = null
  const others: Record<string, PublicState> = {}
  for (const row of pubs.data as { user_id: string; state: PublicState }[]) {
    if (row.user_id === me) myPub = row.state
    else others[row.user_id] = row.state
  }
  const myPriv = (priv.data?.state as PrivateState | undefined) ?? null
  set({ players: players.data as RoomPlayer[], others })
  ;(log.data as LogEntry[]).reverse().forEach((e) => pushLog(e, true))
  lastTurnKey = turnKey()

  if (myPub?.zones && myPriv) {
    set({ pub: myPub, priv: myPriv })
    return
  }
  // Primera vez en esta partida: se prepara la mesa con el mazo elegido.
  const mine = (players.data as RoomPlayer[]).find((p) => p.user_id === me)
  const deck = useDecks.getState().decks.find((d) => mine && d.id === mine.deck_id)
  if (!deck) {
    set({
      tableError: `No encuentro tu mazo «${mine?.deck_name ?? '?'}». ¿Lo has borrado? El anfitrión puede terminar la partida para elegir otro.`,
    })
    return
  }
  setupGame(deck)
}

/** Partida de práctica en solitario (no se guarda). */
export function startPractice(deck: Deck) {
  closeRoom()
  const me = myId()!
  set({
    practice: true,
    room: { id: null, name: 'Práctica', host_id: me, status: 'playing', turn_user: me, turn_number: 1 },
    players: [{ user_id: me, username: myName(), seat: 0 }],
  })
  lastTurnKey = turnKey()
  setupGame(deck)
}

function setupGame(deck: Deck) {
  const lib: TCard[] = []
  const cmd: TCard[] = []
  const tokens: TokenBase[] = []
  for (const c of deck.cards ?? []) {
    const base = { id: c.id, name: c.name, img: safeImg(c.img), type: c.type || '' }
    if (c.sec === 'tokens') {
      tokens.push(base)
      continue
    }
    for (let i = 0; i < (c.qty || 1); i++) {
      const card: TCard = { iid: newIid(), ...base }
      if (c.sec === 'comandante') {
        card.cmd = true
        cmd.push(card)
      } else lib.push(card)
    }
  }
  const g: Draft = {
    pub: {
      deckName: deck.name || 'Mazo sin nombre',
      life: START_LIFE,
      poison: 0,
      cmdDmg: {},
      casts: {},
      mulligans: 0,
      tokens,
      zones: { battlefield: [], graveyard: [], exile: [], command: cmd },
      handCount: 0,
      libCount: 0,
    },
    priv: { library: shuffle(lib), hand: [], hidden: {} },
  }
  drawCards(g, HAND_SIZE)
  commitDraft(g, `se sienta a la mesa con «${g.pub.deckName}» y roba ${HAND_SIZE} cartas.`)
}

function turnKey(): string {
  const r = get().room
  return r ? `${r.turn_number}:${r.turn_user}` : ''
}

// Al empezar mi turno: enderezar y robar (menos el primer turno de la partida).
function checkTurn() {
  const k = turnKey()
  if (k === lastTurnKey) return
  lastTurnKey = k
  const room = get().room
  if (!room || room.turn_user !== myId()) return
  act((g) => {
    untap(g)
    const drew = room.turn_number > 1 ? drawCards(g, 1) : 0
    return `empieza su turno: endereza sus permanentes${drew ? ' y roba una carta' : ''}.`
  })
}

/* ---------- Guardar y registro ---------- */

type Draft = { pub: PublicState; priv: PrivateState }
type Said = void | null | string | { text: string; data?: LogEntry['data'] }

/** Aplica un cambio sobre una copia de mi mesa, la guarda y, si hay texto, lo apunta en el registro. */
function act(fn: (g: Draft) => Said | false) {
  const s = get()
  if (!s.pub || !s.priv) return
  const g: Draft = { pub: structuredClone(s.pub), priv: structuredClone(s.priv) }
  const said = fn(g)
  if (said === false) return
  commitDraft(g, said)
}

function commitDraft(g: Draft, said: Said) {
  g.pub.handCount = g.priv.hand.length
  g.pub.libCount = g.priv.library.length
  set({ pub: g.pub, priv: g.priv })
  if (typeof said === 'string') void addLog(said)
  else if (said) void addLog(said.text, said.data)
  scheduleSave()
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
let saving = false
let saveAgain = false

function scheduleSave() {
  if (get().practice) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void save(), 150)
}

async function save() {
  if (saving) {
    saveAgain = true
    return
  }
  const { room, practice, pub, priv } = get()
  const me = myId()
  if (!room?.id || practice || !pub || !priv || !me) return
  saving = true
  set({ save: { text: 'Guardando…' } })
  const row = { room_id: room.id, user_id: me, updated_at: new Date().toISOString() }
  const [a, b] = await Promise.all([
    sb.from('game_public').upsert({ ...row, state: pub }),
    sb.from('game_private').upsert({ ...row, state: priv }),
  ])
  saving = false
  const err = a.error || b.error
  if (err) {
    console.error(err)
    set({ save: { text: 'Error al guardar', bad: true } })
  } else set({ save: { text: '' } })
  if (saveAgain) {
    saveAgain = false
    void save()
  }
}

export async function addLog(text: string, data?: LogEntry['data'], kind: 'action' | 'chat' = 'action') {
  const room = get().room
  if (!room) return
  if (get().practice || !room.id) {
    pushLog({ id: 'p' + ++localLog, kind, user_id: myId(), username: myName(), text, data: data ?? null })
    return
  }
  const r = await sb
    .from('game_log')
    .insert({ room_id: room.id, kind, text: text.slice(0, 500), data: data ?? null })
    .select()
    .single()
  if (r.error) {
    console.error(r.error)
    return
  }
  pushLog(r.data as LogEntry)
}

function pushLog(e: LogEntry, quiet = false) {
  if (!e || logIds.has(e.id)) return
  logIds.add(e.id)
  let log = get().log.concat(e)
  const last = log[log.length - 2]
  if (last && typeof e.id === 'number' && typeof last.id === 'number' && e.id < last.id) {
    log.sort((a, b) => Number(a.id) - Number(b.id))
  }
  if (log.length > 300) log = log.slice(log.length - 300)
  const unread = !quiet && get().sideHidden && e.kind === 'chat' && e.user_id && e.user_id !== myId() ? 1 : 0
  set((s) => ({ log, unread: s.unread + unread }))
}

/* ---------- Cartas y zonas (sobre la copia de trabajo) ---------- */

function zoneList(g: Draft, z: Zone): TCard[] {
  if (z === 'hand') return g.priv.hand
  if (z === 'library') return g.priv.library
  return g.pub.zones[z]
}

const ZONES: Zone[] = ['hand', 'battlefield', 'command', 'graveyard', 'exile', 'library']

function locate(g: Draft, iid: string) {
  for (const zone of ZONES) {
    const list = zoneList(g, zone)
    const index = list.findIndex((c) => c.iid === iid)
    if (index >= 0) return { zone, list, index, card: list[index] }
  }
  return null
}

/** Una carta boca abajo solo guarda en lo público su posición; el resto va en lo oculto. */
export function realCard(c: TCard, priv: PrivateState | null): TCard {
  return c.fd && priv ? { ...c, ...(priv.hidden[c.iid] ?? {}) } : c
}

function autoPos(g: Draft, card: TCard) {
  const t = card.type || ''
  const y = /\bLand\b/.test(t) ? 64 : /\bCreature\b/.test(t) ? 4 : 34
  const slot = g.pub.zones.battlefield.filter((c) => (c.y ?? 0) >= y && (c.y ?? 0) < y + 20).length
  return { x: 3 + (slot % 9) * 10.5, y: y + Math.floor(slot / 9) * 6 }
}

interface MoveOpts {
  x?: number
  y?: number
  faceDown?: boolean
  bottom?: boolean
  noAsk?: boolean
}

function moveCard(g: Draft, iid: string, to: Zone, opts: MoveOpts) {
  const loc = locate(g, iid)
  if (!loc) return null
  const card = realCard(loc.card, g.priv)
  loc.list.splice(loc.index, 1)
  delete g.priv.hidden[iid]
  const from = loc.zone
  // Las fichas dejan de existir al salir del campo de batalla.
  if (card.token && to !== 'battlefield') return { card, from, gone: true }

  let clean: TCard = { iid: card.iid, id: card.id, name: card.name, img: card.img, type: card.type }
  if (card.cmd) clean.cmd = true
  if (card.token) clean.token = true
  if (card.imgBack) clean.imgBack = card.imgBack
  if (to === 'battlefield') {
    const pos = opts.x != null && opts.y != null ? { x: opts.x, y: opts.y } : autoPos(g, clean)
    if (opts.faceDown) {
      g.priv.hidden[clean.iid] = clean
      clean = { iid: clean.iid, fd: true }
    }
    clean.x = pos.x
    clean.y = pos.y
    clean.tapped = false
    clean.counters = {}
  }
  const list = zoneList(g, to)
  if (to === 'library' && !opts.bottom) list.unshift(clean)
  else list.push(clean)
  return { card, from, gone: false }
}

function describeMove(res: { card: TCard; from: Zone; gone: boolean }, to: Zone, opts: MoveOpts): string {
  const hidden = opts.faceDown || ((res.from === 'hand' || res.from === 'library') && (to === 'hand' || to === 'library'))
  const what = hidden ? 'una carta' : `«${res.card.name}»`
  if (res.gone) return `la ficha ${what} deja de existir`
  if (to === 'battlefield' && res.from === 'hand') return opts.faceDown ? 'juega una carta boca abajo' : `juega ${what}`
  if (to === 'battlefield' && res.from === 'command') return `lanza a su comandante ${what}`
  if (to === 'graveyard' && res.from === 'hand') return `descarta ${what}`
  if (to === 'hand' && res.from === 'library') return 'pone una carta de su biblioteca en la mano'
  const dest = to === 'library' && opts.bottom ? 'al fondo de la biblioteca' : TO[to]
  return `mueve ${what} ${FROM[res.from]} ${dest}`
}

function drawCards(g: Draft, n: number): number {
  let got = 0
  while (got < n && g.priv.library.length) {
    g.priv.hand.push(g.priv.library.shift()!)
    got++
  }
  if (got < n) toast('Tu biblioteca está vacía.', true)
  return got
}

function untap(g: Draft): number {
  let n = 0
  for (const c of g.pub.zones.battlefield) {
    if (c.tapped) {
      c.tapped = false
      n++
    }
  }
  return n
}

function onField(g: Draft, iid: string): TCard | null {
  return g.pub.zones.battlefield.find((c) => c.iid === iid) ?? null
}

/* ---------- Acciones de la mesa ---------- */

export const game = {
  draw(n = 1) {
    act((g) => {
      const got = drawCards(g, n)
      if (!got) return false
      return got === 1 ? 'roba una carta.' : `roba ${plural(got, 'carta', 'cartas')}.`
    })
  },

  shuffleLibrary() {
    act((g) => {
      shuffle(g.priv.library)
      return 'baraja su biblioteca.'
    })
  },

  move(iid: string, to: Zone, opts: MoveOpts = {}) {
    const s = get()
    if (!s.pub || !s.priv) return
    const g0: Draft = { pub: s.pub, priv: s.priv }
    const loc = locate(g0, iid)
    if (!loc) return
    const real = realCard(loc.card, s.priv)
    if (real.cmd && loc.zone !== 'command' && to !== 'command' && to !== 'battlefield' && !opts.noAsk) {
      const dest = to === 'library' && opts.bottom ? 'al fondo de la biblioteca' : TO[to]
      if (window.confirm(`«${real.name}» es tu comandante. ¿Lo devuelves a la zona de mando en lugar de moverlo ${dest}?`)) to = 'command'
    }
    act((g) => {
      const res = moveCard(g, iid, to, opts)
      if (!res) return false
      let extra = ''
      if (res.from === 'command' && to === 'battlefield' && real.cmd) {
        const n = g.pub.casts[iid] || 0
        extra = n ? ` (impuesto de comandante: +${2 * n})` : ''
        g.pub.casts[iid] = n + 1
      }
      return describeMove(res, to, opts) + extra + '.'
    })
  },

  /** Recoloca una carta en la mano (o la trae a la mano en esa posición). */
  toHandAt(iid: string, slot: number) {
    const s = get()
    if (!s.priv) return
    const inHand = s.priv.hand.some((c) => c.iid === iid)
    if (!inHand) game.move(iid, 'hand')
    act((g) => {
      const from = g.priv.hand.findIndex((c) => c.iid === iid)
      if (from < 0) return false
      const [card] = g.priv.hand.splice(from, 1)
      g.priv.hand.splice(clamp(slot, 0, g.priv.hand.length), 0, card)
      if (inHand && from === slot) return false
      return null
    })
  },

  /** Mueve una carta dentro del campo de batalla (o la pone en él en esa posición). */
  placeOnField(iid: string, x: number, y: number) {
    const s = get()
    if (!s.pub) return
    const pos = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
    if (s.pub.zones.battlefield.some((c) => c.iid === iid)) {
      act((g) => {
        const c = onField(g, iid)
        if (!c) return false
        c.x = pos.x
        c.y = pos.y
        return null
      })
    } else game.move(iid, 'battlefield', pos)
  },

  toggleTap(iid: string) {
    act((g) => {
      const c = onField(g, iid)
      if (!c) return false
      c.tapped = !c.tapped
      return `${c.tapped ? 'gira' : 'endereza'} ${c.fd ? 'una carta boca abajo' : `«${c.name}»`}.`
    })
  },

  untapAll() {
    act((g) => (untap(g) ? 'endereza sus permanentes.' : false))
  },

  counter(iid: string, kind: string, delta: number) {
    act((g) => {
      const c = onField(g, iid)
      if (!c) return false
      c.counters = c.counters || {}
      const v = Math.max(0, (c.counters[kind] || 0) + delta)
      if (v) c.counters[kind] = v
      else delete c.counters[kind]
      counterLog(c, kind)
      return null
    })
  },

  toggleFaceDown(iid: string) {
    act((g) => {
      const c = onField(g, iid)
      if (!c) return false
      const i = g.pub.zones.battlefield.indexOf(c)
      if (c.fd) {
        const real = realCard(c, g.priv)
        delete g.priv.hidden[iid]
        delete real.fd
        g.pub.zones.battlefield[i] = real
        return `pone boca arriba «${real.name}».`
      }
      g.priv.hidden[iid] = { iid, id: c.id, name: c.name, img: c.img, type: c.type, cmd: c.cmd, imgBack: c.imgBack }
      g.pub.zones.battlefield[i] = { iid, fd: true, x: c.x, y: c.y, tapped: c.tapped, counters: c.counters || {} }
      return `pone boca abajo «${c.name}».`
    })
  },

  async transform(iid: string) {
    const c = get().pub?.zones.battlefield.find((x) => x.iid === iid)
    if (!c || c.fd) return
    let back = c.imgBack
    if (!back) {
      try {
        const card = await fetchCard(c.id!)
        back = safeImg(card.card_faces?.[1]?.image_uris?.small)
        if (!back) {
          toast(`«${c.name}» no tiene otra cara.`, true)
          return
        }
      } catch {
        toast('No se ha podido cargar la otra cara.', true)
        return
      }
    }
    act((g) => {
      const card = onField(g, iid)
      if (!card) return false
      card.imgBack = back
      card.flipped = !card.flipped
      return `transforma «${card.name}».`
    })
  },

  copyAsToken(iid: string) {
    act((g) => {
      const c = onField(g, iid)
      if (!c || c.fd) return false
      g.pub.zones.battlefield.push({
        iid: newIid(),
        id: c.id,
        name: c.name,
        img: c.img,
        type: c.type,
        token: true,
        x: clamp((c.x ?? 0) + 3, 0, 94),
        y: clamp((c.y ?? 0) + 4, 0, 88),
        tapped: false,
        counters: {},
      })
      return `crea una ficha copia de «${c.name}».`
    })
  },

  createToken(base: TokenBase) {
    act((g) => {
      const t: TCard = { iid: newIid(), id: base.id, name: base.name, img: safeImg(base.img), type: base.type || 'Token', token: true, tapped: false, counters: {} }
      Object.assign(t, autoPos(g, t))
      g.pub.zones.battlefield.push(t)
      return `crea una ficha «${t.name}».`
    })
  },

  changeStat(key: string, delta: number) {
    act((g) => {
      statFrom = statFrom || {}
      if (!(key in statFrom)) statFrom[key] = statGet(g.pub, key)
      const before = statGet(g.pub, key)
      statSet(g.pub, key, before + delta)
      // El daño de comandante también es daño normal: resta vida.
      if (key.startsWith('cmd:')) {
        const real = statGet(g.pub, key) - before
        if (real) {
          if (!('life' in statFrom)) statFrom.life = g.pub.life
          g.pub.life -= real
        }
      }
      clearTimeout(statTimer)
      statTimer = setTimeout(flushStats, 1500)
      return null
    })
  },

  mulligan() {
    const s = get()
    if (!s.pub) return
    const n = (s.pub.mulligans || 0) + 1
    if (
      !window.confirm(
        `¿Hacer mulligan? Tu mano vuelve a la biblioteca, se baraja y robas ${HAND_SIZE}.\n` +
          'En Commander el primero es gratis; después pon en el fondo una carta por cada mulligan extra.',
      )
    )
      return
    act((g) => {
      g.priv.library = shuffle(g.priv.library.concat(g.priv.hand))
      g.priv.hand = []
      drawCards(g, HAND_SIZE)
      g.pub.mulligans = n
      return `hace mulligan (${n}) y roba ${HAND_SIZE} cartas.`
    })
  },

  revealHand() {
    const hand = get().priv?.hand ?? []
    if (!hand.length) return toast('No tienes cartas en la mano.')
    void addLog('enseña su mano.', { cards: hand.slice(0, 20).map((c) => ({ name: c.name, img: c.img })) })
  },

  revealCard(iid: string) {
    const c = get().priv?.hand.find((x) => x.iid === iid)
    if (c) void addLog(`revela «${c.name}» de su mano.`, { cards: [{ name: c.name, img: c.img }] })
  },

  revealTop() {
    const c = get().priv?.library[0]
    if (c) void addLog(`revela la carta de arriba de su biblioteca: «${c.name}».`, { cards: [{ name: c.name, img: c.img }] })
  },

  mill(k: number) {
    act((g) => {
      const names = []
      for (let i = 0; i < k && g.priv.library.length; i++) {
        const c = g.priv.library.shift()!
        g.pub.zones.graveyard.push(c)
        names.push({ name: c.name, img: c.img })
      }
      if (!names.length) return false
      return { text: `muele ${plural(names.length, 'carta', 'cartas')}.`, data: { cards: names } }
    })
  },

  exileTop(faceDown: boolean) {
    act((g) => {
      const c = g.priv.library.shift()
      if (!c) return false
      if (faceDown) {
        g.priv.hidden[c.iid] = c
        g.pub.zones.exile.push({ iid: c.iid, fd: true })
        return 'exilia boca abajo la carta de arriba de su biblioteca.'
      }
      g.pub.zones.exile.push(c)
      return `exilia la carta de arriba de su biblioteca: «${c.name}».`
    })
  },

  lookTop(k: number) {
    const lib = get().priv?.library ?? []
    const ids = lib.slice(0, k).map((c) => c.iid)
    if (!ids.length) return
    void addLog(`mira las ${plural(ids.length, 'carta', 'cartas')} de arriba de su biblioteca.`)
    set({
      viewer: {
        title: 'Arriba de tu biblioteca',
        hint: 'La primera es la de arriba. Usa «Arriba de la biblioteca» para reordenarlas.',
        zone: 'library',
        owner: true,
        topIds: ids,
      },
    })
  },

  searchLibrary() {
    void addLog('busca en su biblioteca.')
    set({ viewer: { title: 'Tu biblioteca', hint: 'Al cerrar se baraja automáticamente.', zone: 'library', owner: true, search: true } })
  },

  roll(sides: number) {
    const v = randInt(sides) + 1
    void addLog(sides === 2 ? `lanza una moneda: ${v === 1 ? 'cara' : 'cruz'}.` : `lanza un d${sides}: ${v}.`)
  },

  chat(text: string) {
    void addLog(text, null, 'chat')
  },

  async passTurn() {
    flushStats()
    const s = get()
    if (!s.room) return
    if (s.practice) {
      set({ room: { ...s.room, turn_number: s.room.turn_number + 1 } })
      void addLog('pasa el turno.')
      checkTurn()
      return
    }
    const r = await sb.rpc('pass_turn', { rid: s.room.id })
    if (r.error) toast(errText(r.error), true)
  },

  /** Termina la partida para todos (anfitrión). Devuelve true si la práctica se ha cerrado. */
  async endGame(): Promise<boolean> {
    const s = get()
    if (s.practice) {
      if (!window.confirm('¿Terminar la práctica?')) return false
      closeRoom()
      return true
    }
    if (!window.confirm('¿Terminar la partida para todos? Volveréis a la sala y se borrará la mesa.')) return false
    const r = await sb.rpc('end_game', { rid: s.room?.id })
    if (r.error) toast(errText(r.error), true)
    return false
  },

  /* Pantalla */

  setView(uid: string | null) {
    set({ view: uid === myId() ? null : uid, menu: null })
  },

  toggleSide() {
    const hidden = !get().sideHidden
    try {
      localStorage.setItem('cm-juego-chat', hidden ? 'oculto' : 'visible')
    } catch {
      /* sin almacenamiento */
    }
    set({ sideHidden: hidden, unread: 0 })
  },

  openMenu(items: MenuItem[], x: number, y: number) {
    set({ menu: { items, x, y } })
  },

  closeMenu() {
    if (get().menu) set({ menu: null })
  },

  openViewer(v: ViewerState) {
    set({ viewer: v, menu: null })
  },

  closeViewer() {
    const v = get().viewer
    set({ viewer: null, menu: null })
    if (v?.search) game.shuffleLibrary()
  },

  openDetail(id: string | undefined) {
    if (id) set({ detailId: id, menu: null })
  },

  closeDetail() {
    set({ detailId: null })
  },

  openTokens(open: boolean) {
    set({ tokensOpen: open, menu: null })
  },
}

/* ---------- Vida, veneno y daño de comandante (con registro agrupado) ---------- */

let statTimer: ReturnType<typeof setTimeout> | undefined
let statFrom: Record<string, number> | null = null

function statGet(pub: PublicState, key: string): number {
  if (key === 'life') return pub.life
  if (key === 'poison') return pub.poison || 0
  return pub.cmdDmg[key.slice(4)] || 0
}

function statSet(pub: PublicState, key: string, v: number) {
  if (key === 'life') pub.life = v
  else if (key === 'poison') pub.poison = Math.max(0, v)
  else pub.cmdDmg[key.slice(4)] = Math.max(0, v)
}

function statLabel(key: string): string {
  if (key === 'life') return 'vida'
  if (key === 'poison') return 'veneno'
  const p = get().players.find((x) => x.user_id === key.slice(4))
  return 'daño de comandante de ' + (p ? p.username : '?')
}

function flushStats() {
  clearTimeout(statTimer)
  const from = statFrom
  statFrom = null
  const pub = get().pub
  if (!from || !pub) return
  const parts = Object.keys(from)
    .filter((k) => statGet(pub, k) !== from[k])
    .map((k) => `${statLabel(k)} ${from[k]} → ${statGet(pub, k)}`)
  if (parts.length) void addLog(`cambia su ${parts.join(', ')}.`)
}

let ctrTimer: ReturnType<typeof setTimeout> | undefined
let ctrLogs: Record<string, { name: string; kind: string; iid: string }> = {}

function counterLog(c: TCard, kind: string) {
  ctrLogs[c.iid + '|' + kind] = { name: c.fd ? 'una carta boca abajo' : `«${c.name}»`, kind, iid: c.iid }
  clearTimeout(ctrTimer)
  ctrTimer = setTimeout(() => {
    const field = get().pub?.zones.battlefield ?? []
    for (const e of Object.values(ctrLogs)) {
      const card = field.find((x) => x.iid === e.iid)
      const n = card?.counters?.[e.kind] ?? 0
      void addLog(`deja ${e.name} con ${n} contador${n === 1 ? '' : 'es'} ${e.kind}.`)
    }
    ctrLogs = {}
  }, 1500)
}
