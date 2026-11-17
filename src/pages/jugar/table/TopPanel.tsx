import { game, myId, opponents, useGame } from '../../../features/game/store'
import { diceMenu } from './menus'

/** Mi panel, siempre arriba aunque mire otra mesa: vida, veneno, daño de comandante y acciones. */
export function TopPanel({ onLeave }: { onLeave: () => void }) {
  const { room, players, pub, practice } = useGame()
  const me = myId()
  if (!room || !pub) return null
  const myTurn = room.turn_user === me
  const host = room.host_id === me
  const name = players.find((p) => p.user_id === me)?.username ?? 'yo'

  async function end() {
    if (await game.endGame()) onLeave()
  }

  return (
    <div className="gpanel">
      <div className="gwho">
        <strong>{name}</strong>
        <span className={myTurn ? 'gturn' : 'note'}>{myTurn ? `Tu turno · ${room.turn_number}` : `Turno ${room.turn_number}`}</span>
      </div>
      <StatBox label="Vida" statKey="life" value={pub.life} steps={[-5, -1, 1, 5]} alert={pub.life <= 0} />
      <StatBox label="Veneno" statKey="poison" value={pub.poison || 0} steps={[-1, 1]} alert={(pub.poison || 0) >= 10} />
      {opponents(players, me).map((p) => {
        const v = pub.cmdDmg[p.user_id] || 0
        return <StatBox key={p.user_id} label={`Comandante de ${p.username}`} statKey={`cmd:${p.user_id}`} value={v} steps={[-1, 1]} alert={v >= 21} />
      })}
      <div className="gacts">
        <button
          type="button"
          className="plain small primary"
          disabled={!myTurn && !host}
          title={!myTurn && !host ? 'No es tu turno' : undefined}
          onClick={() => void game.passTurn()}
        >
          Pasar turno
        </button>
        <button type="button" className="plain small" onClick={game.untapAll}>
          Enderezar todo
        </button>
        <button type="button" className="plain small" onClick={() => game.openTokens(true)}>
          Ficha…
        </button>
        <button
          type="button"
          className="plain small"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            diceMenu(r.left, r.bottom)
          }}
        >
          Dado
        </button>
        <button type="button" className="plain small" onClick={game.mulligan}>
          Mulligan
        </button>
        <button type="button" className="plain small" onClick={game.revealHand}>
          Enseñar mano
        </button>
        {practice ? (
          <button type="button" className="plain small" onClick={() => void end()}>
            Terminar práctica
          </button>
        ) : (
          <button type="button" className="plain small" title="Volver a la lista de salas (la partida sigue)" onClick={onLeave}>
            Salas
          </button>
        )}
        {host && !practice && (
          <button type="button" className="plain small danger" onClick={() => void end()}>
            Terminar partida
          </button>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, statKey, value, steps, alert }: { label: string; statKey: string; value: number; steps: number[]; alert: boolean }) {
  return (
    <div className={'gstat' + (alert ? ' alert' : '')}>
      <span className="gstat-l">{label}</span>
      <div className="gstat-row">
        {steps
          .filter((s) => s < 0)
          .map((s) => (
            <button key={s} type="button" className="gstep" aria-label={`${label} ${s}`} title={`${label} ${s}`} onClick={() => game.changeStat(statKey, s)}>
              {s}
            </button>
          ))}
        <strong className="gstat-v">{value}</strong>
        {steps
          .filter((s) => s > 0)
          .map((s) => (
            <button key={s} type="button" className="gstep" aria-label={`${label} +${s}`} title={`${label} +${s}`} onClick={() => game.changeStat(statKey, s)}>
              +{s}
            </button>
          ))}
      </div>
    </div>
  )
}
