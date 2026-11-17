import { useEffect, useRef } from 'react'
import { game, useGame, type ViewerState } from '../../../features/game/store'
import type { PrivateState, PublicState, TCard } from '../../../features/game/types'
import { plural } from '../../../features/game/util'
import { GCard } from './GCard'

/** Las cartas que enseña un visor (se recalculan con cada cambio de la mesa). */
function viewerCards(v: ViewerState, pub: PublicState | null, priv: PrivateState | null, others: Record<string, PublicState>): TCard[] {
  if (!v.owner) {
    const zones = others[v.uid ?? '']?.zones
    return zones && v.zone !== 'hand' && v.zone !== 'library' ? zones[v.zone].slice().reverse() : []
  }
  if (!pub || !priv) return []
  if (v.zone === 'library') {
    if (v.topIds) {
      // Solo las que siguen arriba (las que mandas al fondo o a otra zona desaparecen del visor).
      return priv.library.slice(0, v.topIds.length).filter((c) => v.topIds!.includes(c.iid))
    }
    return priv.library.slice().sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }
  if (v.zone === 'hand') return priv.hand
  return pub.zones[v.zone].slice().reverse()
}

/** Ventana para ver un cementerio, un exilio o parte de la biblioteca. */
export function Viewer() {
  const v = useGame((s) => s.viewer)
  const pub = useGame((s) => s.pub)
  const priv = useGame((s) => s.priv)
  const others = useGame((s) => s.others)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (v && !dlg.open) dlg.showModal()
    if (!v && dlg.open) dlg.close()
  }, [v])

  const cards = v ? viewerCards(v, pub, priv, others) : []

  return (
    <dialog ref={ref} className="gviewer" onClose={() => useGame.getState().viewer && game.closeViewer()}>
      {v && (
        <>
          <div className="gv-head">
            <h2>{v.title}</h2>
            <span className="note gv-count">{plural(cards.length, 'carta', 'cartas')}</span>
            <button type="button" className="plain small" onClick={game.closeViewer}>
              Cerrar
            </button>
          </div>
          {v.hint && <p className="note gv-hint">{v.hint}</p>}
          <div className="gv-grid">
            {cards.map((c) => (
              <GCard key={c.iid} card={c} zone={v.zone} own={v.owner} uid={v.uid} flat priv={priv} />
            ))}
            {!cards.length && <p className="note">No hay cartas.</p>}
          </div>
        </>
      )}
    </dialog>
  )
}
