import { game, myId, useGame } from '../../../features/game/store'
import type { PublicZone, RoomPlayer } from '../../../features/game/types'
import { GCard } from './GCard'

/** La mesa grande: mi campo de batalla o el de otro jugador. */
export function Board() {
  const view = useGame((s) => s.view)
  const players = useGame((s) => s.players)
  const other = view ? players.find((p) => p.user_id === view) : undefined
  return other ? <OtherBoard p={other} /> : <MyBoard />
}

function MyBoard() {
  const field = useGame((s) => s.pub!.zones.battlefield)
  const priv = useGame((s) => s.priv)
  return (
    <div className="gboard">
      <div className="gbf mine" data-drop="battlefield">
        {field.map((c) => (
          <GCard key={c.iid} card={c} zone="battlefield" own priv={priv} />
        ))}
        {!field.length && <p className="gbf-empty">Arrastra aquí cartas de tu mano para jugarlas</p>}
      </div>
    </div>
  )
}

function OtherBoard({ p }: { p: RoomPlayer }) {
  const st = useGame((s) => s.others[p.user_id])
  const turn = useGame((s) => s.room?.turn_user === p.user_id)
  const zones = st?.zones

  return (
    <div className={'gboard other' + (turn ? ' turn' : '')}>
      <div className="gopp-head">
        <strong>Mesa de {p.username}</strong>
        {turn && <span className="gturn">Su turno</span>}
        {zones && (
          <>
            <span className={'glife' + (st.life <= 0 ? ' dead' : '')}>♥ {st.life}</span>
            {st.poison > 0 && <span className="gpois">☠ {st.poison}</span>}
            <span className="gcount">
              Mano {st.handCount || 0} · Biblioteca {st.libCount || 0}
            </span>
            <ZoneButton label="Cementerio" p={p} zone="graveyard" />
            <ZoneButton label="Exilio" p={p} zone="exile" />
          </>
        )}
        <button type="button" className="plain small gback-me" onClick={() => game.setView(myId())}>
          Volver a mi mesa
        </button>
      </div>
      {!zones ? (
        <p className="note">Preparando su mesa…</p>
      ) : (
        <div className="gopp-body">
          {zones.command.length > 0 && (
            <div className="gopp-cmd">
              {zones.command.map((c) => (
                <GCard key={c.iid} card={c} zone="command" uid={p.user_id} />
              ))}
            </div>
          )}
          <div className="gbf opp">
            {zones.battlefield.map((c) => (
              <GCard key={c.iid} card={c} zone="battlefield" uid={p.user_id} />
            ))}
            {!zones.battlefield.length && <p className="gbf-empty">Todavía no tiene cartas en el campo</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function ZoneButton({ label, p, zone }: { label: string; p: RoomPlayer; zone: PublicZone }) {
  const n = useGame((s) => s.others[p.user_id]?.zones?.[zone]?.length ?? 0)
  return (
    <button
      type="button"
      className="plain small"
      onClick={() => game.openViewer({ title: `${label} de ${p.username}`, zone, owner: false, uid: p.user_id })}
    >
      {label} {n}
    </button>
  )
}
