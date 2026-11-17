/*
 * Importar listas de mazos copiadas de Moxfield, Archidekt, EDHPlay…
 * Admite «1 Sol Ring», «1x Sol Ring», «1 Sol Ring (C21) 263», secciones como
 * «Commander» o «Sideboard», etiquetas y marcas de foil.
 */
import { fetchCollection, fetchFuzzy, wait, type Card } from '../../api/scryfall'
import { LIMIT, place, type Deck } from './rules'

export interface ListEntry {
  qty: number
  name: string
  set: string
  cn: string
  cmd: boolean
}

// Líneas que son títulos de bloque en las listas exportadas, no cartas.
const HEADS =
  /^(deck|mazo|main|mainboard|main deck|sideboard|side|companion|tokens?|creatures?|lands?|instants?|sorcery|sorceries|artifacts?|enchantments?|planeswalkers?|battles?)$/

/** Convierte el texto pegado en una lista de cartas, sin nombres repetidos. */
export function parseList(text: string): ListEntry[] {
  const byName = new Map<string, ListEntry>()
  const list: ListEntry[] = []
  let mode: '' | 'cmd' | 'skip' = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      mode = ''
      continue
    }
    const comment = /^(\/\/|#)/.test(line)
    if (comment || !/^\d/.test(line)) {
      const head = line
        .replace(/^(\/\/|#)\s*/, '')
        .replace(/\s*\(\d+\)\s*$/, '')
        .replace(/[:\s]+$/, '')
        .toLowerCase()
      if (/^(commanders?|comandante)$/.test(head)) {
        mode = 'cmd'
        continue
      }
      if (/^(maybeboard|considering)$/.test(head)) {
        mode = 'skip'
        continue
      }
      if (comment || HEADS.test(head)) {
        mode = ''
        continue
      }
    }
    if (mode === 'skip') continue

    const m = /^(\d+)\s*[xX]?\s+(.+)$/.exec(line)
    const qty = m ? Math.min(parseInt(m[1], 10), 99) : 1
    let rest = (m ? m[2] : line)
      .replace(/\s+\^[^^]*\^/g, '') // colores de etiqueta de Archidekt
      .replace(/(\s+\[[^\]]*\])+\s*$/, '') // categorías entre corchetes
      .replace(/\s+\*[A-Za-z]+\*/g, '') // *F* (foil), *E* (etched)
      .replace(/\s+#\S+/g, '') // etiquetas
    let set = ''
    let cn = ''
    const p = /\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?\s*$/.exec(rest)
    if (p) {
      set = p[1].toLowerCase()
      cn = (p[2] || '').toLowerCase()
      rest = rest.slice(0, p.index)
    }
    const name = rest.trim().replace(/\s+\/{1,2}\s+/, ' // ')
    if (!name || qty < 1) continue

    const key = name.toLowerCase()
    const prev = byName.get(key)
    if (prev) {
      prev.qty += qty
      if (mode === 'cmd') prev.cmd = true
    } else {
      const e = { qty, name, set, cn, cmd: mode === 'cmd' }
      byName.set(key, e)
      list.push(e)
    }
  }
  return list
}

/** Busca las cartas de la lista y las mete en una copia del mazo. */
export async function importList(deck: Deck, entries: ListEntry[], clear: boolean): Promise<{ deck: Deck; msg: string; bad: boolean }> {
  const byName = new Map<string, Card>()
  const index = (cards: Card[]) => {
    for (const card of cards) {
      for (const n of [card.name, ...(card.card_faces ?? []).map((f) => f.name)]) {
        const k = n.toLowerCase()
        if (!byName.has(k)) byName.set(k, card)
      }
    }
  }
  const missing = () => entries.filter((e) => !byName.has(e.name.toLowerCase()))

  // 1.º la edición exacta si la lista la indica; 2.º por nombre; 3.º búsqueda aproximada.
  index(await fetchCollection(entries.map((e) => (e.set && e.cn ? { set: e.set, collector_number: e.cn } : { name: e.name }))))
  const left = missing().filter((e) => e.set && e.cn)
  if (left.length) index(await fetchCollection(left.map((e) => ({ name: e.name }))))
  for (const e of missing().slice(0, 15)) {
    await wait(120)
    const card = await fetchFuzzy(e.name)
    if (card) byName.set(e.name.toLowerCase(), card)
  }

  const d: Deck = { ...deck, cards: clear ? [] : deck.cards.map((c) => ({ ...c })) }
  const total = (x: Deck) => x.cards.reduce((n, c) => n + c.qty, 0)
  const before = total(d)
  let dup = 0
  let full = 0
  const notFound: string[] = []
  for (const e of entries) {
    const card = byName.get(e.name.toLowerCase())
    if (!card) {
      notFound.push(e.name)
      continue
    }
    const r = place(d, card, e.qty, e.cmd)
    if (r === 'dup') dup++
    else if (r === 'full' || r === 'part') full++
  }
  const added = total(d) - before

  let msg = added === 1 ? 'Importada 1 carta.' : `Importadas ${added} cartas.`
  if (dup) msg += ` ${dup}${dup === 1 ? ' ya estaba' : ' ya estaban'} en el mazo.`
  if (full) msg += ` ${full}${full === 1 ? ' no cabe' : ' no caben'} por el límite de ${LIMIT}.`
  if (notFound.length) {
    msg += ` No encontradas (${notFound.length}): ${notFound.slice(0, 10).join(', ')}${
      notFound.length > 10 ? ` y ${notFound.length - 10} más` : ''
    }.`
  }
  return { deck: d, msg, bad: !!(full || notFound.length) }
}
