import { create } from 'zustand'
import { sb } from '../../api/supabase'
import { useAuth } from '../../auth/useAuth'
import { newDeckId, normalizeDeck, type Deck, type Result } from './rules'

/*
 * Los mazos del usuario, guardados en Supabase (tabla «decks»).
 * Los cambios se suben agrupados poco después de hacerlos.
 */

// Mazos hechos sin cuenta en versiones antiguas: se pasan a la cuenta al entrar.
const OLD_STORE = 'cartas-magic.mazos'

interface Msg {
  text: string
  bad?: boolean
}

interface DecksState {
  decks: Deck[]
  currentId: string | null
  loaded: boolean
  /** Estado del guardado («Guardando…», «Guardado en tu cuenta.»…). */
  note: Msg
  /** Último aviso del editor («Añadida a Criaturas: …»). */
  msg: Msg
  select: (id: string) => void
  create: () => void
  rename: (name: string) => void
  remove: () => void
  /** Aplica el resultado de una regla a su mazo y lo guarda. */
  apply: (r: Result) => void
  say: (text: string, bad?: boolean) => void
  flush: () => Promise<void>
}

let dirty = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined

function queueSave(id: string) {
  dirty.add(id)
  clearTimeout(timer)
  timer = setTimeout(() => void useDecks.getState().flush(), 700)
  useDecks.setState({ note: { text: 'Guardando…' } })
}

export const useDecks = create<DecksState>((set, get) => ({
  decks: [],
  currentId: null,
  loaded: false,
  note: { text: '' },
  msg: { text: '' },

  select: (id) => set({ currentId: id, msg: { text: '' } }),

  create: () => {
    const deck: Deck = { id: newDeckId(), name: `Mazo ${get().decks.length + 1}`, cards: [] }
    set((s) => ({ decks: [...s.decks, deck], currentId: deck.id, msg: { text: '' } }))
    queueSave(deck.id)
  },

  rename: (name) => {
    const id = get().currentId
    if (!id) return
    set((s) => ({ decks: s.decks.map((d) => (d.id === id ? { ...d, name } : d)) }))
    queueSave(id)
  },

  remove: () => {
    const id = get().currentId
    if (!id) return
    const rest = get().decks.filter((d) => d.id !== id)
    set({ decks: rest, currentId: rest[0]?.id ?? null, msg: { text: '' } })
    dirty.delete(id)
    void sb
      .from('decks')
      .delete()
      .eq('id', id)
      .then((res) => {
        if (res.error) {
          console.error(res.error)
          set({ note: { text: 'No se ha podido borrar el mazo de la nube.', bad: true } })
        }
      })
  },

  apply: (r) => {
    const current = get().decks.find((d) => d.id === r.deck.id)
    // Si la regla no ha cambiado nada (p. ej. «ya está en el mazo»), solo se avisa.
    if (current && r.deck !== current) {
      set((s) => ({ decks: s.decks.map((d) => (d.id === current.id ? r.deck : d)) }))
      queueSave(current.id)
    }
    set({ msg: { text: r.msg, bad: r.bad } })
  },

  say: (text, bad) => set({ msg: { text, bad } }),

  flush: async () => {
    clearTimeout(timer)
    const ids = [...dirty]
    dirty = new Set()
    const user = useAuth.getState().user
    if (!user) return
    const now = new Date().toISOString()
    const rows = ids
      .map((id) => get().decks.find((d) => d.id === id))
      .filter((d): d is Deck => !!d)
      .map((d) => ({ id: d.id, user_id: user.id, name: d.name, cards: d.cards, updated_at: now }))
    if (!rows.length) {
      set({ note: { text: 'Guardado en tu cuenta.' } })
      return
    }
    const res = await sb.from('decks').upsert(rows)
    if (res.error) {
      ids.forEach((id) => dirty.add(id))
      console.error(res.error)
      set({ note: { text: 'No se ha podido guardar en la nube. Se reintentará con el próximo cambio.', bad: true } })
    } else {
      set({ note: { text: 'Guardado en tu cuenta.' } })
    }
  },
}))

function readOldDecks(): Deck[] {
  try {
    const v = JSON.parse(localStorage.getItem(OLD_STORE) ?? 'null')
    return Array.isArray(v) ? v.filter((d) => d && d.id && Array.isArray(d.cards)) : []
  } catch {
    return []
  }
}

export function oldDeckCount(): number {
  return readOldDecks().length
}

let loadToken = 0

async function load(userId: string | null) {
  const mine = ++loadToken
  dirty = new Set()
  clearTimeout(timer)
  useDecks.setState({ decks: [], currentId: null, loaded: false, msg: { text: '' }, note: { text: '' } })
  if (!userId) return
  useDecks.setState({ note: { text: 'Cargando tus mazos…' } })
  const res = await sb.from('decks').select('id,name,cards').eq('user_id', userId).order('created_at')
  if (mine !== loadToken) return
  if (res.error) {
    console.error(res.error)
    useDecks.setState({ loaded: true, note: { text: 'No se han podido cargar tus mazos.', bad: true } })
    return
  }
  let decks: Deck[] = res.data.map((r) => ({ id: r.id, name: r.name, cards: Array.isArray(r.cards) ? r.cards : [] }))

  // Los mazos hechos sin cuenta en este navegador pasan a la cuenta.
  let moved = 0
  const have = new Set(decks.map((d) => d.id))
  const toMove = readOldDecks().filter((d) => !have.has(d.id))
  if (toMove.length) {
    const up = await sb.from('decks').insert(toMove.map((d) => ({ id: d.id, user_id: userId, name: d.name, cards: d.cards })))
    if (mine !== loadToken) return
    if (up.error) console.error(up.error)
    else {
      decks = decks.concat(toMove)
      moved = toMove.length
      try {
        localStorage.removeItem(OLD_STORE)
      } catch {
        /* sin acceso al almacenamiento */
      }
    }
  }

  // Planeswalkers guardados en Hechizos (de antes de tener sección propia): se recolocan y se guardan.
  const fixed = decks.map(normalizeDeck)
  const changed = fixed.filter((d, i) => d !== decks[i])
  decks = fixed

  useDecks.setState({
    decks,
    currentId: decks[0]?.id ?? null,
    loaded: true,
    note: {
      text: moved
        ? `${moved === 1 ? 'Se ha pasado 1 mazo' : `Se han pasado ${moved} mazos`} de este navegador a tu cuenta.`
        : 'Guardado en tu cuenta.',
    },
  })
  changed.forEach((d) => queueSave(d.id))
}

// Al entrar o salir de la cuenta, se cargan (o se vacían) los mazos.
useAuth.subscribe((s, prev) => {
  const id = s.user?.id ?? null
  if (id !== (prev.user?.id ?? null)) void load(id)
})

// Si se cierra la página con cambios sin subir, avisa e intenta subirlos.
window.addEventListener('beforeunload', (ev) => {
  if (!dirty.size) return
  void useDecks.getState().flush()
  ev.preventDefault()
})
