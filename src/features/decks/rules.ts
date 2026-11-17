/*
 * Reglas de los mazos de Commander: secciones, límite de 100 cartas,
 * una copia por carta (salvo tierras básicas) y un comandante.
 * Son funciones puras: reciben un mazo y devuelven uno nuevo, sin tocar el original.
 */
import { cardImage, type Card } from '../../api/scryfall'

export type SectionKey =
  | 'comandante'
  | 'criaturas'
  | 'hechizos'
  | 'artefactos'
  | 'instantaneos'
  | 'encantamientos'
  | 'planeswalkers'
  | 'tierras'
  | 'tokens'

/** Una carta tal como se guarda dentro de un mazo. */
export interface DeckCard {
  id: string
  name: string
  type: string
  sec: SectionKey
  /** Sección a la que vuelve si deja de ser comandante. */
  home: SectionKey
  qty: number
  img: string | null
  eur: string | null
  /** Puede ser comandante. */
  cmd: boolean
  basic: boolean
}

export interface Deck {
  id: string
  name: string
  cards: DeckCard[]
}

export const LIMIT = 100

/** Orden en que se muestran. Los tokens no cuentan para el límite. */
export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'comandante', label: 'Comandante' },
  { key: 'criaturas', label: 'Criaturas' },
  { key: 'hechizos', label: 'Hechizos' },
  { key: 'artefactos', label: 'Artefactos' },
  { key: 'instantaneos', label: 'Instantáneos' },
  { key: 'encantamientos', label: 'Encantamientos' },
  { key: 'planeswalkers', label: 'Planeswalkers' },
  { key: 'tierras', label: 'Tierras' },
  { key: 'tokens', label: 'Tokens' },
]

export const FULL = `El mazo ya tiene ${LIMIT} cartas. Quita alguna para añadir otra.`

export function sectionLabel(key: SectionKey): string {
  return SECTIONS.find((s) => s.key === key)?.label ?? key
}

/** En cartas de dos caras manda la cara frontal. */
export function frontType(card: Card): string {
  return (card.type_line || card.card_faces?.[0]?.type_line || '').split(' // ')[0]
}

export function sectionFor(card: Card): SectionKey {
  const t = frontType(card)
  if (/token|emblem/.test(card.layout || '') || /\bToken\b/.test(t)) return 'tokens'
  if (/\bCreature\b/.test(t)) return 'criaturas'
  if (/\bLand\b/.test(t)) return 'tierras'
  if (/\bPlaneswalker\b/.test(t)) return 'planeswalkers'
  if (/\bInstant\b/.test(t)) return 'instantaneos'
  if (/\bSorcery\b/.test(t)) return 'hechizos'
  if (/\bArtifact\b/.test(t)) return 'artefactos'
  if (/\bEnchantment\b/.test(t)) return 'encantamientos'
  return 'hechizos' // las batallas no tienen sección propia
}

/**
 * Los mazos guardados antes de existir la sección Planeswalkers los tienen en Hechizos:
 * se pasan a su sección al cargarlos. Devuelve el mismo mazo si no hay nada que cambiar.
 */
export function normalizeDeck(deck: Deck): Deck {
  const fix = (c: DeckCard) => c.sec !== 'tokens' && c.home === 'hechizos' && /\bPlaneswalker\b/.test(c.type || '')
  if (!deck.cards.some(fix)) return deck
  return {
    ...deck,
    cards: deck.cards.map((c) =>
      fix(c) ? { ...c, home: 'planeswalkers' as const, sec: c.sec === 'comandante' ? c.sec : ('planeswalkers' as const) } : c,
    ),
  }
}

export function canCommand(card: Card): boolean {
  const t = frontType(card)
  const text = card.oracle_text || card.card_faces?.[0]?.oracle_text || ''
  return (/\bLegendary\b/.test(t) && /\bCreature\b/.test(t)) || /can be your commander/i.test(text)
}

/** Lo mínimo de cada carta que se guarda en el mazo. */
export function slim(card: Card): DeckCard {
  const sec = sectionFor(card)
  return {
    id: card.id,
    name: card.name,
    type: frontType(card),
    sec,
    home: sec,
    qty: 1,
    img: cardImage(card, 'small'),
    eur: card.prices ? card.prices.eur || card.prices.eur_foil || null : null,
    cmd: sec !== 'tokens' && canCommand(card),
    basic: /\bBasic\b/.test(frontType(card)),
  }
}

export function countCards(deck: Deck): number {
  return deck.cards.reduce((n, c) => (c.sec === 'tokens' ? n : n + c.qty), 0)
}

export function countTokens(deck: Deck): number {
  return deck.cards.reduce((n, c) => (c.sec === 'tokens' ? n + c.qty : n), 0)
}

export function deckValue(deck: Deck): number {
  return deck.cards.reduce((t, c) => (c.sec === 'tokens' || c.eur == null ? t : t + Number(c.eur) * c.qty), 0)
}

function clone(deck: Deck): Deck {
  return { ...deck, cards: deck.cards.map((c) => ({ ...c })) }
}

function setCommander(deck: Deck, entry: DeckCard) {
  deck.cards.forEach((c) => {
    if (c.sec === 'comandante') c.sec = c.home
  })
  entry.sec = 'comandante'
  entry.qty = 1
}

export interface Result {
  deck: Deck
  msg: string
  bad?: boolean
}

/** Añade una carta buscada (o la hace comandante). */
export function addCard(deck: Deck, card: Card, asCommander: boolean): Result {
  const d = clone(deck)
  const c = slim(card)

  if (c.sec === 'tokens') {
    const tk = d.cards.find((x) => x.sec === 'tokens' && x.id === c.id)
    if (tk) tk.qty++
    else d.cards.push(c)
    return { deck: d, msg: `Token añadido: ${c.name}.` }
  }

  const same = d.cards.find((x) => x.sec !== 'tokens' && x.name === c.name)
  if (same) {
    if (asCommander) {
      setCommander(d, same)
      return { deck: d, msg: `${c.name} es ahora el comandante.` }
    }
    if (!same.basic) return { deck, msg: `«${c.name}» ya está en el mazo: en Commander solo se permite una copia.`, bad: true }
    if (countCards(d) >= LIMIT) return { deck, msg: FULL, bad: true }
    same.qty++
    return { deck: d, msg: `Añadida otra copia de ${c.name}.` }
  }

  if (countCards(d) >= LIMIT) return { deck, msg: FULL, bad: true }
  d.cards.push(c)
  if (asCommander) {
    setCommander(d, c)
    return { deck: d, msg: `${c.name} es ahora el comandante.` }
  }
  return { deck: d, msg: `Añadida a ${sectionLabel(c.sec)}: ${c.name}.` }
}

/** Cambia algo de una carta del mazo (buscándola por posición en la lista). */
function withEntry(deck: Deck, entry: DeckCard, fn: (d: Deck, e: DeckCard) => string | Result): Result {
  const d = clone(deck)
  const i = deck.cards.indexOf(entry)
  if (i < 0) return { deck, msg: '' }
  const out = fn(d, d.cards[i])
  return typeof out === 'string' ? { deck: d, msg: out } : out
}

export function removeCard(deck: Deck, entry: DeckCard): Result {
  return withEntry(deck, entry, (d, e) => {
    d.cards.splice(d.cards.indexOf(e), 1)
    return `Quitada: ${e.name}.`
  })
}

export function changeQty(deck: Deck, entry: DeckCard, delta: 1 | -1): Result {
  if (delta > 0 && entry.sec !== 'tokens' && countCards(deck) >= LIMIT) return { deck, msg: FULL, bad: true }
  return withEntry(deck, entry, (d, e) => {
    e.qty += delta
    if (e.qty < 1) d.cards.splice(d.cards.indexOf(e), 1)
    return ''
  })
}

export function makeCommander(deck: Deck, entry: DeckCard): Result {
  return withEntry(deck, entry, (d, e) => {
    setCommander(d, e)
    return `${e.name} es ahora el comandante.`
  })
}

/** Usa otra edición o arte para una carta del mazo. */
export function changePrint(deck: Deck, entry: DeckCard, print: Card): Result {
  return withEntry(deck, entry, (_d, e) => {
    e.id = print.id
    e.img = cardImage(print, 'small')
    e.eur = print.prices ? print.prices.eur || print.prices.eur_foil || null : null
    return `Arte de ${e.name} cambiado a ${print.set_name}.`
  })
}

/**
 * Mete una carta importada en el mazo (lo modifica). Devuelve 'ok', 'dup' (ya estaba),
 * 'full' (no cabe) o 'part' (solo han cabido algunas copias).
 */
export function place(deck: Deck, card: Card, qty: number, asCommander: boolean): 'ok' | 'dup' | 'full' | 'part' {
  const c = slim(card)
  if (c.sec === 'tokens') {
    const tk = deck.cards.find((x) => x.sec === 'tokens' && x.id === c.id)
    if (tk) tk.qty += qty
    else deck.cards.push({ ...c, qty })
    return 'ok'
  }
  const room = LIMIT - countCards(deck)
  const same = deck.cards.find((x) => x.sec !== 'tokens' && x.name === c.name)
  if (same) {
    if (asCommander && same.cmd) {
      setCommander(deck, same)
      return 'ok'
    }
    if (!same.basic) return 'dup'
    if (room < 1) return 'full'
    same.qty += Math.min(qty, room)
    return qty > room ? 'part' : 'ok'
  }
  if (room < 1) return 'full'
  c.qty = c.basic ? Math.min(qty, room) : 1
  deck.cards.push(c)
  if (asCommander && c.cmd) setCommander(deck, c)
  return c.basic && qty > room ? 'part' : 'ok'
}

/** La lista del mazo como texto «1 Nombre», con el comandante primero y sin tokens. */
export function deckToText(deck: Deck): string {
  return deck.cards
    .filter((c) => c.sec !== 'tokens')
    .sort((a, b) => Number(b.sec === 'comandante') - Number(a.sec === 'comandante') || a.name.localeCompare(b.name))
    .map((c) => `${c.qty} ${c.name}`)
    .join('\n')
}

export function newDeckId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
