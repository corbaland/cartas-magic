import { game, myId, opponents, useGame } from '../../../features/game/store'
import type { PublicZone } from '../../../features/game/types'
import { plural } from '../../../features/game/util'
import { GCard } from './GCard'
import { diceMenu, libraryMenu } from './menus'

/** Mi parte de la mesa: panel (vida, acciones), zonas y mano. */
export function MyArea({ onLeave }: { onLeave: () => void }) {
  const { room, players, pub, priv, practice } = useGame()
  const me = myId()
  if (!room || !pub || !priv) return null
  const myTurn = room.turn_user === me
  const host = room.host_id === me
  const name = players.find((p) => p.user_id === me)?.username ?? 'yo'

  async function end() {
    if (await game.endGame()) onLeave()
  }

  return (
    <div className="gme">
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

      <div className="gbottom">
        <div className="gzones">
          {/* Biblioteca: clic roba; clic derecho (o mantener pulsado) abre sus opciones. */}
          <button
            type="button"
            className="gzone glib"
            data-drop="library"
            title="Clic: robar una carta · Clic derecho: más opciones"
            aria-label={`Biblioteca, ${plural(priv.library.length, 'carta', 'cartas')}. Pulsa para robar; clic derecho para más opciones`}
            onClick={() => game.draw(1)}
            onContextMenu={(e) => {
              e.preventDefault()
              libraryMenu(e.clientX, e.clientY)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                libraryMenu(r.left, r.top)
              }
            }}
          >
            <div className="gback" />
            <span className="gzone-n">{priv.library.length}</span>
            <span className="gzone-l">Biblioteca</span>
          </button>
          <Pile zone="graveyard" label="Cementerio" />
          <Pile zone="exile" label="Exilio" />
          <div className="gzone gcmdz" data-drop="command">
            {pub.zones.command.map((c) => {
              const casts = pub.casts[c.iid] || 0
              return (
                <GCard key={c.iid} card={c} zone="command" own priv={priv}>
                  {casts > 0 && <span className="gtag gtax">+{2 * casts}</span>}
                </GCard>
              )
            })}
            <span className="gzone-l">Mando</span>
          </div>
        </div>

        {/* Mano (se puede reordenar arrastrando) */}
        <div className="ghand" id="gHand" data-drop="hand">
          {priv.hand.map((c) => (
            <GCard key={c.iid} card={c} zone="hand" own priv={priv} />
          ))}
          {!priv.hand.length && <p className="gbf-empty">Mano vacía</p>}
        </div>
      </div>
    </div>
  )
}

function Pile({ zone, label }: { zone: PublicZone; label: string }) {
  const list = useGame((s) => s.pub!.zones[zone])
  const priv = useGame((s) => s.priv)
  const top = list[list.length - 1]
  return (
    <div
      className="gzone gpile"
      data-drop={zone}
      onClick={(e) => {
        // El clic en la carta de arriba lo gestiona la mesa; aquí, el montón vacío o el borde.
        if (!(e.target as Element).closest('.gcard')) {
          game.openViewer({ title: zone === 'graveyard' ? 'Tu cementerio' : 'Tu exilio', zone, owner: true })
        }
      }}
    >
      {top ? <GCard card={top} zone={zone} own priv={priv} /> : <div className="gpile-empty" />}
      <span className="gzone-n">{list.length}</span>
      <span className="gzone-l">{label}</span>
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
