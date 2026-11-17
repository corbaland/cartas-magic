/* Menús de la mesa: los de cada carta, la biblioteca y los dados. */
import { game, realCard, useGame, type MenuItem } from '../../../features/game/store'
import type { TCard, Zone } from '../../../features/game/types'
import { askNumber, plural } from '../../../features/game/util'

function findMine(iid: string): { zone: Zone; card: TCard } | null {
  const { pub, priv } = useGame.getState()
  if (!pub || !priv) return null
  const lists: [Zone, TCard[]][] = [
    ['hand', priv.hand],
    ['battlefield', pub.zones.battlefield],
    ['command', pub.zones.command],
    ['graveyard', pub.zones.graveyard],
    ['exile', pub.zones.exile],
    ['library', priv.library],
  ]
  for (const [zone, list] of lists) {
    const card = list.find((c) => c.iid === iid)
    if (card) return { zone, card }
  }
  return null
}

export function cardMenu(iid: string, x: number, y: number) {
  const loc = findMine(iid)
  if (!loc) return
  const { zone, card: c } = loc
  const real = realCard(c, useGame.getState().priv)
  const to = (z: Zone, opts?: Parameters<typeof game.move>[2]) => () => game.move(iid, z, opts)
  const items: MenuItem[] = [{ title: (real.name || 'Carta') + (c.fd ? ' (boca abajo)' : '') + (c.token ? ' · ficha' : '') }]

  if (zone === 'battlefield') {
    items.push({ label: c.tapped ? 'Enderezar' : 'Girar', fn: () => game.toggleTap(iid) })
    items.push({ counter: '+1/+1', iid }, { counter: '-1/-1', iid }, { counter: 'Contador', iid })
    items.push({ label: c.fd ? 'Poner boca arriba' : 'Poner boca abajo', fn: () => game.toggleFaceDown(iid) })
    if (!c.fd) items.push({ label: 'Transformar (otra cara)', fn: () => void game.transform(iid) })
    if (!c.fd) items.push({ label: 'Copiar (crear ficha)', fn: () => game.copyAsToken(iid) })
    items.push('-')
    items.push({ label: 'A la mano', fn: to('hand') })
    items.push({ label: 'Al cementerio', fn: to('graveyard') })
    items.push({ label: 'Al exilio', fn: to('exile') })
    items.push({ label: 'Arriba de la biblioteca', fn: to('library') })
    items.push({ label: 'Fondo de la biblioteca', fn: to('library', { bottom: true }) })
    if (real.cmd) items.push({ label: 'A la zona de mando', fn: to('command') })
  } else if (zone === 'hand') {
    items.push({ label: 'Jugar', fn: to('battlefield') })
    items.push({ label: 'Jugar boca abajo', fn: to('battlefield', { faceDown: true }) })
    items.push({ label: 'Revelar', fn: () => game.revealCard(iid) })
    items.push('-')
    items.push({ label: 'Descartar', fn: to('graveyard') })
    items.push({ label: 'Al exilio', fn: to('exile') })
    items.push({ label: 'Arriba de la biblioteca', fn: to('library') })
    items.push({ label: 'Fondo de la biblioteca', fn: to('library', { bottom: true }) })
    if (real.cmd) items.push({ label: 'A la zona de mando', fn: to('command') })
  } else if (zone === 'command') {
    const n = useGame.getState().pub?.casts[iid] || 0
    items.push({ label: 'Lanzar' + (n ? ` (impuesto +${2 * n})` : ''), fn: to('battlefield') })
    items.push('-')
    items.push({ label: 'A la mano', fn: to('hand', { noAsk: true }) })
    items.push({ label: 'Al cementerio', fn: to('graveyard', { noAsk: true }) })
    items.push({ label: 'Al exilio', fn: to('exile', { noAsk: true }) })
  } else {
    items.push({ label: 'Al campo de batalla', fn: to('battlefield') })
    items.push({ label: 'A la mano', fn: to('hand') })
    if (zone !== 'graveyard') items.push({ label: 'Al cementerio', fn: to('graveyard') })
    if (zone !== 'exile') items.push({ label: 'Al exilio', fn: to('exile') })
    items.push({ label: 'Arriba de la biblioteca', fn: to('library') })
    items.push({ label: 'Fondo de la biblioteca', fn: to('library', { bottom: true }) })
    if (real.cmd) items.push({ label: 'A la zona de mando', fn: to('command') })
  }
  if (real.id) {
    items.push('-')
    items.push({ label: 'Ver carta', fn: () => game.openDetail(real.id) })
  }
  game.openMenu(items, x, y)
}

export function libraryMenu(x: number, y: number) {
  const n = useGame.getState().priv?.library.length ?? 0
  game.openMenu(
    [
      { title: `Biblioteca (${plural(n, 'carta', 'cartas')})` },
      { label: 'Robar una carta', fn: () => game.draw(1) },
      {
        label: 'Robar varias…',
        fn: () => {
          const k = askNumber('¿Cuántas cartas robas?', 2, n)
          if (k) game.draw(k)
        },
      },
      { label: 'Barajar', fn: () => game.shuffleLibrary() },
      '-',
      {
        label: 'Mirar las de arriba…',
        fn: () => {
          const k = askNumber('¿Cuántas cartas de arriba quieres mirar?', 3, n)
          if (k) game.lookTop(k)
        },
      },
      { label: 'Buscar en la biblioteca…', fn: () => game.searchLibrary() },
      { label: 'Revelar la de arriba', fn: () => game.revealTop() },
      '-',
      {
        label: 'Moler (al cementerio)…',
        fn: () => {
          const k = askNumber('¿Cuántas cartas mueles?', 1, n)
          if (k) game.mill(k)
        },
      },
      { label: 'Exiliar la de arriba', fn: () => game.exileTop(false) },
      { label: 'Exiliar la de arriba boca abajo', fn: () => game.exileTop(true) },
    ],
    x,
    y,
  )
}

export function diceMenu(x: number, y: number) {
  game.openMenu(
    [
      { title: 'Lanzar' },
      { label: 'Moneda', fn: () => game.roll(2) },
      { label: 'Dado de 6', fn: () => game.roll(6) },
      { label: 'Dado de 20', fn: () => game.roll(20) },
    ],
    x,
    y,
  )
}

/** Menú para varias cartas seleccionadas del campo. */
export function groupMenu(ids: string[], x: number, y: number) {
  const field = useGame.getState().pub?.zones.battlefield ?? []
  const cards = field.filter((c) => ids.includes(c.iid))
  if (!cards.length) return
  const n = cards.length
  const allTapped = cards.every((c) => c.tapped)
  const to = (z: Zone, opts?: Parameters<typeof game.moveMany>[2]) => () => game.moveMany(ids, z, opts)
  game.openMenu(
    [
      { title: `${plural(n, 'carta seleccionada', 'cartas seleccionadas')}` },
      { label: allTapped ? 'Enderezar todas' : 'Girar todas', fn: () => game.tapMany(ids, !allTapped) },
      '-',
      { label: 'A la mano', fn: to('hand') },
      { label: 'Al cementerio', fn: to('graveyard') },
      { label: 'Al exilio', fn: to('exile') },
      { label: 'Arriba de la biblioteca', fn: to('library') },
      { label: 'Fondo de la biblioteca', fn: to('library', { bottom: true }) },
      '-',
      { label: 'Quitar la selección', fn: () => game.clearSel() },
    ],
    x,
    y,
  )
}
