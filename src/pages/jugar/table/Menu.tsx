import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { game, useGame } from '../../../features/game/store'
import { clamp } from '../../../features/game/util'

/** Menú contextual de la mesa (cartas, biblioteca, dados). */
export function Menu() {
  const menu = useGame((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)

  // Se coloca donde se pulsó, sin salirse de la pantalla.
  useLayoutEffect(() => {
    const m = ref.current
    if (!menu || !m) return
    m.style.left = clamp(menu.x, 8, window.innerWidth - m.offsetWidth - 8) + 'px'
    m.style.top = clamp(menu.y, 8, window.innerHeight - m.offsetHeight - 8) + 'px'
    m.style.visibility = 'visible'
    m.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [menu])

  // Se cierra al pulsar fuera o con Escape.
  useEffect(() => {
    if (!menu) return
    const down = (ev: PointerEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) game.closeMenu()
    }
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        game.closeMenu()
      }
    }
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('keydown', key)
    }
  }, [menu])

  if (!menu) return null
  // Dentro de un visor abierto, el menú tiene que ir dentro del diálogo para poder usarse.
  const host = (document.querySelector('dialog.gviewer[open]') as HTMLElement | null) ?? document.body

  return createPortal(
    <div
      ref={ref}
      className="gmenu"
      role="menu"
      style={{ left: menu.x, top: menu.y, visibility: 'hidden' }}
    >
      {menu.items.map((it, i) => {
        if (it === '-') return <div key={i} className="gsep" />
        if ('title' in it) return <div key={i} className="gmtitle">{it.title}</div>
        if ('counter' in it) return <CounterRow key={i} iid={it.iid} kind={it.counter} />
        return (
          <button
            key={i}
            type="button"
            className="gmi"
            role="menuitem"
            onClick={() => {
              game.closeMenu()
              it.fn()
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>,
    host,
  )
}

function CounterRow({ iid, kind }: { iid: string; kind: string }) {
  const value = useGame((s) => s.pub?.zones.battlefield.find((c) => c.iid === iid)?.counters?.[kind] ?? 0)
  return (
    <div className="gmctr">
      <span>{kind === 'Contador' ? 'Otros contadores' : `Contadores ${kind}`}</span>
      <button type="button" className="gstep" aria-label={`Quitar contador ${kind}`} onClick={() => game.counter(iid, kind, -1)}>
        −
      </button>
      <strong>{value}</strong>
      <button type="button" className="gstep" aria-label={`Poner contador ${kind}`} onClick={() => game.counter(iid, kind, 1)}>
        +
      </button>
    </div>
  )
}
