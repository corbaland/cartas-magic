import { useEffect } from 'react'
import { game, useGame } from '../../../features/game/store'
import type { Zone } from '../../../features/game/types'
import { clamp } from '../../../features/game/util'
import { cardMenu, groupMenu } from './menus'

/*
 * Ratón y táctil en la mesa:
 * - arrastrar mis cartas entre zonas (o dentro de la mano para reordenarlas);
 * - arrastrar en una parte vacía de mi campo: recuadro para seleccionar varias cartas,
 *   que luego se mueven, giran (doble clic) o llevan a otra zona (clic derecho) a la vez;
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
  /** Cartas seleccionadas que se mueven junto a esta (incluida). */
  group: string[]
  long?: ReturnType<typeof setTimeout>
}

interface Marquee {
  field: HTMLElement
  x0: number
  y0: number
  box: HTMLElement | null
  base: string[] // selección previa (con Mayús se añade a ella)
}

function cardFrom(target: EventTarget | null): HTMLElement | null {
  const n = target instanceof Element ? (target.closest('.gcard') as HTMLElement | null) : null
  if (!n || !n.dataset.iid || (!n.closest('.gtable') && !n.closest('.gviewer'))) return null
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
    let marquee: Marquee | null = null
    let lastClick = { iid: '', t: 0 }

    function endDrag(d: Drag | null) {
      document.body.classList.remove('dragging-card')
      markHandSlot(-1)
      document.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'))
      document.querySelectorAll('.gcard.dragging').forEach((x) => x.classList.remove('dragging'))
      if (d?.ghost) d.ghost.remove()
    }

    function click(d: Drag, ev: PointerEvent) {
      if (d.inViewer) return cardMenu(d.iid, ev.clientX, ev.clientY)
      const now = Date.now()
      const dbl = lastClick.iid === d.iid && now - lastClick.t < 400
      lastClick = dbl ? { iid: '', t: 0 } : { iid: d.iid, t: now }
      if (d.zone === 'battlefield' || d.zone === 'hand' || d.zone === 'command') {
        if (!dbl) return
        if (d.zone === 'battlefield' && d.group.length > 1) {
          // Doble clic en una carta seleccionada: gira (o endereza) todas las seleccionadas.
          const tapped = d.node.classList.contains('tapped')
          game.tapMany(d.group, !tapped)
        } else if (d.zone === 'battlefield') game.toggleTap(d.iid)
        else game.move(d.iid, 'battlefield')
        return
      }
      if (d.zone === 'graveyard' || d.zone === 'exile') {
        game.openViewer({ title: d.zone === 'graveyard' ? 'Tu cementerio' : 'Tu exilio', zone: d.zone, owner: true })
        return
      }
      cardMenu(d.iid, ev.clientX, ev.clientY)
    }

    /* ---------- Recuadro de selección ---------- */

    function startMarquee(field: HTMLElement, ev: PointerEvent) {
      ev.preventDefault()
      marquee = { field, x0: ev.clientX, y0: ev.clientY, box: null, base: ev.shiftKey ? useGame.getState().sel : [] }
    }

    function moveMarquee(ev: PointerEvent) {
      const m = marquee!
      if (!m.box && Math.hypot(ev.clientX - m.x0, ev.clientY - m.y0) < 6) return
      const fr = m.field.getBoundingClientRect()
      const x1 = clamp(Math.min(m.x0, ev.clientX), fr.left, fr.right)
      const y1 = clamp(Math.min(m.y0, ev.clientY), fr.top, fr.bottom)
      const x2 = clamp(Math.max(m.x0, ev.clientX), fr.left, fr.right)
      const y2 = clamp(Math.max(m.y0, ev.clientY), fr.top, fr.bottom)
      if (!m.box) {
        m.box = document.createElement('div')
        m.box.className = 'gmarquee'
        m.field.appendChild(m.box)
      }
      Object.assign(m.box.style, {
        left: x1 - fr.left + m.field.scrollLeft + 'px',
        top: y1 - fr.top + m.field.scrollTop + 'px',
        width: x2 - x1 + 'px',
        height: y2 - y1 + 'px',
      })
      // Entran las cartas que toca el recuadro.
      const ids = new Set(m.base)
      m.field.querySelectorAll<HTMLElement>('.gcard[data-own]').forEach((n) => {
        const r = n.getBoundingClientRect()
        if (r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2) ids.add(n.dataset.iid!)
      })
      game.setSel([...ids])
    }

    function endMarquee() {
      const m = marquee!
      marquee = null
      if (m.box) m.box.remove()
      else if (!m.base.length) game.clearSel() // un clic en vacío deselecciona
    }

    /* ---------- Pulsar, mover, soltar ---------- */

    function onDown(ev: PointerEvent) {
      if (ev.button !== 0) return
      const n = cardFrom(ev.target)
      if (!n) {
        const field = ev.target instanceof Element ? (ev.target.closest('#gField') as HTMLElement | null) : null
        if (field) startMarquee(field, ev)
        return
      }
      if (n.dataset.own !== '1') return
      ev.preventDefault()
      const zone = n.dataset.zone as Zone
      const iid = n.dataset.iid!
      const sel = useGame.getState().sel
      const inSel = zone === 'battlefield' && sel.includes(iid) && !n.closest('.gviewer')
      if (!inSel) game.clearSel()
      const r = n.getBoundingClientRect()
      const d: Drag = {
        iid,
        zone,
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
        group: inSel ? sel : [iid],
      }
      // Mantener pulsado abre el menú (útil en el móvil).
      d.long = setTimeout(() => {
        if (drag === d && !d.moved) {
          drag = null
          if (d.group.length > 1) groupMenu(d.group, d.x0, d.y0)
          else cardMenu(d.iid, d.x0, d.y0)
        }
      }, 550)
      drag = d
    }

    function onMove(ev: PointerEvent) {
      if (marquee) return moveMarquee(ev)
      const d = drag
      if (!d || d.inViewer) return
      if (!d.moved && Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 6) return
      if (!d.moved) {
        d.moved = true
        clearTimeout(d.long)
        const g = d.node.cloneNode(true) as HTMLElement
        g.classList.add('gghost')
        g.classList.remove('sel')
        Object.assign(g.style, { width: d.w + 'px', height: d.h + 'px', left: '0', top: '0' })
        if (d.group.length > 1) {
          const badge = document.createElement('span')
          badge.className = 'gghost-n'
          badge.textContent = '×' + d.group.length
          g.appendChild(badge)
        }
        document.body.appendChild(g)
        d.ghost = g
        for (const id of d.group) document.querySelector(`.gbf.mine .gcard[data-iid="${id}"]`)?.classList.add('dragging')
        d.node.classList.add('dragging')
        document.body.classList.add('dragging-card')
      }
      d.ghost!.style.transform = `translate(${ev.clientX - d.offX}px,${ev.clientY - d.offY}px)`
      const target = dropTarget(ev.clientX, ev.clientY)
      document.querySelectorAll('.drop-over').forEach((x) => x !== target && x.classList.remove('drop-over'))
      target?.classList.add('drop-over')
      markHandSlot(target?.dataset.drop === 'hand' && d.group.length === 1 ? handSlot(ev.clientX) : -1)
    }

    function onUp(ev: PointerEvent) {
      if (marquee) return endMarquee()
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
      if (to === 'battlefield') {
        const r = target.getBoundingClientRect()
        const x = clamp(((ev.clientX - d.offX - r.left) / r.width) * 100, 0, 94)
        const y = clamp(((ev.clientY - d.offY - r.top) / r.height) * 100, 0, 88)
        if (d.group.length > 1) {
          // Todas se desplazan lo mismo que la carta arrastrada.
          const field = useGame.getState().pub?.zones.battlefield ?? []
          const me = field.find((c) => c.iid === d.iid)
          const dx = x - (me?.x ?? x)
          const dy = y - (me?.y ?? y)
          game.placeMany(
            field.filter((c) => d.group.includes(c.iid)).map((c) => ({ iid: c.iid, x: (c.x ?? 0) + dx, y: (c.y ?? 0) + dy })),
          )
        } else game.placeOnField(d.iid, x, y)
      } else if (d.group.length > 1) {
        game.moveMany(d.group, to)
      } else if (to === 'hand') {
        game.toHandAt(d.iid, slot)
      } else if (to !== d.zone) {
        game.move(d.iid, to)
      }
    }

    function onCancel() {
      if (marquee) endMarquee()
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
      const sel = useGame.getState().sel
      if (n.dataset.zone === 'battlefield' && sel.length > 1 && sel.includes(n.dataset.iid!)) groupMenu(sel, ev.clientX, ev.clientY)
      else cardMenu(n.dataset.iid!, ev.clientX, ev.clientY)
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

    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !useGame.getState().menu) game.clearSel()
    }

    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('contextmenu', onContext)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      onCancel()
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('contextmenu', onContext)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}
