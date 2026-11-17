import { game, myId, opponents, useGame } from '../../../features/game/store'
import { clamp } from '../../../features/game/util'

/** Columna de la derecha: una entrada por jugador con un mini plano de su campo. */
export function Seats() {
  const { players, pub, priv, others, view, room, sideHidden, unread } = useGame()
  const me = myId()
  const meRow = players.find((p) => p.user_id === me) ?? { user_id: me!, username: 'yo', seat: 0 }
  const list = [meRow, ...opponents(players, me)]

  return (
    <div className="gseats" role="navigation" aria-label="Mesas de los jugadores">
      <span className="gseats-h">Mesas</span>
      {list.map((p) => {
        const mine = p.user_id === me
        const st = mine ? pub : others[p.user_id]
        const active = mine ? !view : view === p.user_id
        const turn = room?.turn_user === p.user_id
        return (
          <button
            key={p.user_id}
            type="button"
            className={'gseat' + (active ? ' on' : '') + (turn ? ' turn' : '')}
            aria-pressed={active}
            title={mine ? 'Ver tu mesa' : `Ver la mesa de ${p.username}`}
            onClick={() => game.setView(p.user_id)}
          >
            <span className="gseat-top">
              <strong>{mine ? 'Tu mesa' : p.username}</strong>
              {turn && <span className="gturn">Turno</span>}
            </span>
            <span className="gmini">
              {(st?.zones?.battlefield ?? []).map((c) => {
                const t = c.type || ''
                const kind = c.fd ? 'fd' : /\bLand\b/.test(t) ? 'land' : /\bCreature\b/.test(t) ? 'crea' : 'other'
                return (
                  <i
                    key={c.iid}
                    className={`gm-${kind}${c.tapped ? ' tap' : ''}`}
                    style={{ left: `${clamp(Number(c.x) || 0, 0, 96)}%`, top: `${clamp(Number(c.y) || 0, 0, 92)}%` }}
                  />
                )
              })}
            </span>
            <span className="gseat-st">
              {st?.zones ? (
                <>
                  <span className={'glife' + (st.life <= 0 ? ' dead' : '')}>♥ {st.life}</span>
                  {st.poison > 0 && <span className="gpois">☠ {st.poison}</span>}
                  <span className="gcount">Mano {mine ? priv?.hand.length : st.handCount || 0}</span>
                </>
              ) : (
                <span className="gcount">Preparando…</span>
              )}
            </span>
          </button>
        )
      })}
      <button
        type="button"
        className="plain small gseat-chat"
        title={sideHidden ? 'Mostrar el registro y el chat' : 'Ocultar el registro y el chat'}
        onClick={game.toggleSide}
      >
        {sideHidden ? 'Mostrar chat' : 'Ocultar chat'}
        {sideHidden && unread > 0 && <span className="gunread">{unread}</span>}
      </button>
    </div>
  )
}
