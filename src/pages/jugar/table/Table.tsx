import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { game, useGame } from '../../../features/game/store'
import { CardDetailById } from '../../../components/CardDetailById'
import { Board } from './Board'
import { MyArea } from './MyArea'
import { Seats } from './Seats'
import { Side } from './Side'
import { Menu } from './Menu'
import { Viewer } from './Viewer'
import { TokensDialog } from './TokensDialog'
import { useTablePointer } from './usePointer'

/** La mesa de juego: una mesa grande, la columna de mesas y el registro con el chat. */
export function Table() {
  const navigate = useNavigate()
  const ready = useGame((s) => !!s.pub && !!s.priv)
  const tableError = useGame((s) => s.tableError)
  const sideHidden = useGame((s) => s.sideHidden)
  const detailId = useGame((s) => s.detailId)

  useTablePointer()

  // En la mesa no se muestra el pie de página y se aprovecha toda la pantalla.
  useEffect(() => {
    document.body.classList.add('in-table')
    return () => document.body.classList.remove('in-table')
  }, [])

  if (tableError) {
    return (
      <div className="page">
        <p className="note bad">{tableError}</p>
        <button type="button" className="plain" onClick={() => navigate('/jugar')}>
          Volver a las salas
        </button>
      </div>
    )
  }
  if (!ready) return <div className="page note">Preparando la mesa…</div>

  return (
    <div className={'gtable' + (sideHidden ? ' noside' : '')}>
      <div className="gmain" data-zoom-area>
        <Board />
        <MyArea onLeave={() => navigate('/jugar')} />
      </div>
      <Seats />
      <Side />
      <Menu />
      <Viewer />
      <TokensDialog />
      <CardDetailById id={detailId} onClose={game.closeDetail} />
    </div>
  )
}
