import type { ReactNode } from 'react'
import { realCard } from '../../../features/game/store'
import type { PrivateState, TCard, Zone } from '../../../features/game/types'
import { clamp, safeImg } from '../../../features/game/util'

interface Props {
  card: TCard
  zone: Zone
  /** Es mía (se puede mover y tiene menú). */
  own?: boolean
  /** Dueño de la carta si no es mía. */
  uid?: string
  /** Sin posición absoluta (visores). */
  flat?: boolean
  priv?: PrivateState | null
  children?: ReactNode
}

/**
 * Una carta de la mesa. Los datos `data-*` los usa el control de ratón de la mesa
 * (arrastrar, doble clic, menú) y `data-zoom` la carta ampliada.
 */
export function GCard({ card: c, zone, own = false, uid, flat = false, priv = null, children }: Props) {
  const real = own && c.fd ? realCard(c, priv) : c
  const src = c.fd && !own ? null : safeImg(real.flipped && real.imgBack ? real.imgBack : real.img)
  const style =
    zone === 'battlefield' && !flat
      ? { left: `${clamp(Number(c.x) || 0, 0, 96)}%`, top: `${clamp(Number(c.y) || 0, 0, 92)}%` }
      : undefined
  const counters = Object.entries(c.counters ?? {})
  const cls = ['gcard', c.tapped && 'tapped', c.fd && 'fd', c.token && 'token', c.cmd && 'cmdr'].filter(Boolean).join(' ')

  return (
    <div
      className={cls}
      style={style}
      data-iid={c.iid}
      data-zone={zone}
      data-own={own ? '1' : undefined}
      data-uid={uid}
      title={c.fd && !own ? 'Carta boca abajo' : real.name || ''}
    >
      {src ? (
        <img src={src} alt={real.name || ''} draggable={false} data-zoom />
      ) : c.fd ? (
        <div className="gback" />
      ) : (
        <div className="gnoimg">{real.name || '?'}</div>
      )}
      {c.fd && own && <span className="gtag">Boca abajo</span>}
      {c.token && <span className="gtag gtok">Ficha</span>}
      {counters.length > 0 && (
        <div className="gctrs">
          {counters.map(([k, v]) => (
            <span key={k} className="gctr">
              {k === 'Contador' ? '●' : k} ×{v}
            </span>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}
