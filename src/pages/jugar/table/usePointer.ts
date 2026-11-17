import { useEffect } from 'react'
import { game, useGame } from '../../../features/game/store'
import type { Zone } from '../../../features/game/types'
import { clamp } from '../../../features/game/util'
import { cardMenu } from './menus'

/*
 * Ratón y táctil en la mesa:
 * - arrastrar mis cartas entre zonas (o dentro de la mano para reordenarlas);
 * - doble clic: girar/enderezar en el campo, jugar desde la mano, lanzar el comandante;
 * - clic derecho o mantener pulsado: menú de la carta;
 * - clic en una carta de otro jugador: su ficha.
 * Las cartas se reconocen por sus atributos data-* (ver GCard).
 */
interface Drag {
  iid: string
  zone: Zone
  node: HTMLElement
  inViewer: boolean
  x0: number
  y0: number
  offX: number
  offY: number
  w: number
  h: number
  moved: boolean
  ghost: HTMLElement | null
  long?: ReturnType<typeof setTimeout>
}

function cardFrom(target: EventTarget | null): HTMLElement | null {
  const n = target instanceof Element ? (target.closest('.gcard') as HTMLElement | null) : null
  if (!n || (!n.closest('.gtable') && !n.closest('.gviewer'))) return null
  return n
}

function handCards(): HTMLElement[] {
  const hand = document.getElementById('gHand')
  return hand ? Array.from(hand.querySelectorAll<HTMLElement>('.gcard')).filter((n) => !n.classList.contains('dragging')) : []
}

/** Posición de la mano en la que caería la carta (sin contar la que se arrastra). */
function handSlot(x: number): number {
  const nodes = handCards()
  let i = 0
  while (i < nodes.length) {
    const r = nodes[i].getBoundingClientRect()
    if (x < r.left + r.width / 2) break
    i++
  }
  return i
}

function markHandSlot(i: number) {
  document.querySelectorAll('.gins-before, .gins-after').forEach((n) => n.classList.remove('gins-before', 'gins-after'))
  if (i < 0) return
  const nodes = handCards()
  if (!nodes.length) return
  if (i < nodes.length) nodes[i].classList.add('gins-before')
  else nodes[nodes.length - 1].classList.add('gins-after')
}

function dropTarget(x: number, y: number): HTMLElement | null {
  const under = document.elementFromPoint(x, y)
  return under ? (under.closest('[data-drop]') as HTMLElement | null) : null
}

export function useTablePointer() {
  useEffect(() => {
    let drag: Drag | null = null
    let lastClick = { iid: '', t: 0 }

    function endDrag(d: Drag | null) {
      document.body.classList.remove('dragging-card')
      markHandSlot(-1)
      document.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'))
      if (d?.ghost) d.ghost.remove()
      if (d?.node.isConnected) d.node.classList.remove('dragging')
    }

    function click(d: Drag, ev: PointerEvent) {
      if (d.inViewer) return cardMenu(d.iid, ev.clientX, ev.clientY)
      const now = Date.now()
      const dbl = lastClick.iid === d.iid && now - lastClick.t < 400
      lastClick = dbl ? { iid: '', t: 0 } : { iid: d.iid, t: now }
      if (d.zone === 'battlefield' || d.zone === 'hand' || d.zone === 'command') {
        if (!dbl) return
        if (d.zone === 'battlefield') game.toggleTap(d.iid)
        else game.move(d.iid, 'battlefield')
        return
      }
      if (d.zone === 'graveyard' || d.zone === 'exile') {
        game.openViewer({ title: d.zone === 'graveyard' ? 'Tu cementerio' : 'Tu exilio', zone: d.zone, owner: true })
        return
      }
      cardMenu(d.iid, ev.clientX, ev.clientY)
    }

    function onDown(ev: PointerEvent) {
      if (ev.button !== 0) return
      const n = cardFrom(ev.target)
      if (!n || n.dataset.own !== '1') return
      ev.preventDefault()
      const r = n.getBoundingClientRect()
      const d: Drag = {
        iid: n.dataset.iid!,
        zone: n.dataset.zone as Zone,
        node: n,
        inViewer: !!n.closest('.gviewer'),
        x0: ev.clientX,
        y0: ev.clientY,
        offX: ev.clientX - r.left,
        offY: ev.clientY - r.top,
        w: r.width,
        h: r.height,
        moved: false,
        ghost: null,
      }
      // Mantener pulsado abre el menú (útil en el móvil).
      d.long = setTimeout(() => {
        if (drag === d && !d.moved) {
          drag = null
          cardMenu(d.iid, d.x0, d.y0)
        }
      }, 550)
      drag = d
    }

    function onMove(ev: PointerEvent) {
      const d = drag
      if (!d || d.inViewer) return
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return
      if (!d.moved) {
        d.moved = true
        clearTimeout(d.long)
        const g = d.node.cloneNode(true) as HTMLElement
        g.classList.add('gghost')
        Object.assign(g.style, { width: d.w + 'px', height: d.h + 'px', left: '0', top: '0' })
        document.body.appendChild(g)
        d.ghost = g
        d.node.classList.add('dragging')
        document.body.classList.add('dragging-card')
      }
      d.ghost!.style.transform = `translate(${ev.clientX - d.offX}px,${ev.clientY - d.offY}px)`
      const target = dropTarget(ev.clientX, ev.clientY)
      document.querySelectorAll('.drop-over').forEach((x) => x !== target && x.classList.remove('drop-over'))
      target?.classList.add('drop-over')
      markHandSlot(target?.dataset.drop === 'hand' ? handSlot(ev.clientX) : -1)
    }

    function onUp(ev: PointerEvent) {
      const d = drag
      if (!d) return
      drag = null
      clearTimeout(d.long)
      if (!d.moved) {
        endDrag(null)
        click(d, ev)
        return
      }
      const target = dropTarget(ev.clientX, ev.clientY)
      const slot = target?.dataset.drop === 'hand' ? handSlot(ev.clientX) : -1
      endDrag(d)
      if (!target) return
      const to = target.dataset.drop as Zone
      if (to === 'hand') {
        game.toHandAt(d.iid, slot)
      } else if (to === 'battlefield') {
        const r = target.getBoundingClientRect()
        const x = clamp(((ev.clientX - d.offX - r.left) / r.width) * 100, 0, 94)
        const y = clamp(((ev.clientY - d.offY - r.top) / r.height) * 100, 0, 88)
        game.placeOnField(d.iid, x, y)
      } else if (to !== d.zone) {
        game.move(d.iid, to)
      }
    }

    function onCancel() {
      if (!drag) return
      clearTimeout(drag.long)
      endDrag(drag)
      drag = null
    }

    function onContext(ev: MouseEvent) {
      const n = cardFrom(ev.target)
      if (!n || n.dataset.own !== '1') return
      ev.preventDefault()
      if (drag) {
        clearTimeout(drag.long)
        drag = null
      }
      cardMenu(n.dataset.iid!, ev.clientX, ev.clientY)
    }

    // Cartas de los demás (boca arriba): ver su ficha.
    function onClick(ev: MouseEvent) {
      const n = cardFrom(ev.target)
      if (!n || n.dataset.own === '1' || n.classList.contains('fd')) return
      const st = useGame.getState().others[n.dataset.uid ?? '']
      if (!st?.zones) return
      const all = [...st.zones.battlefield, ...st.zones.graveyard, ...st.zones.exile, ...st.zones.command]
      game.openDetail(all.find((c) => c.iid === n.dataset.iid)?.id)
    }

    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('contextmenu', onContext)
    document.addEventListener('click', onClick)
    return () => {
      onCancel()
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('contextmenu', onContext)
      document.removeEventListener('click', onClick)
    }
  }, [])
}
