import type { MouseEvent } from 'react'
import { game, myId, useGame } from '../../../features/game/store'
import type { PrivateState, PublicZone, RoomPlayer, TCard } from '../../../features/game/types'
import { plural } from '../../../features/game/util'
import { GCard } from './GCard'
import { libraryMenu } from './menus'

/*
 * La mesa grande de un jugador (la mía o la de otro):
 *   campo de batalla arriba y, debajo, de izquierda a derecha:
 *   mano · biblioteca · cementerio · exilio · zona de mando.
 */
export function Board() {
  const view = useGame((s) => s.view)
  const players = useGame((s) => s.players)
  const other = view ? players.find((p) => p.user_id === view) : undefined
  return other ? <OtherBoard p={other} /> : <MyBoard />
}

const ZONE_LABEL: Record<PublicZone, string> = {
  battlefield: 'Campo de batalla',
  graveyard: 'Cementerio',
  exile: 'Exilio',
  command: 'Mando',
}

function MyBoard() {
  const pub = useGame((s) => s.pub!)
  const priv = useGame((s) => s.priv!)
  const sel = useGame((s) => s.sel)
  const field = pub.zones.battlefield

  return (
    <div className="gboard">
      <div className="gbf mine" id="gField" data-drop="battlefield">
        {field.map((c) => (
          <GCard key={c.iid} card={c} zone="battlefield" own priv={priv} selected={sel.includes(c.iid)} />
        ))}
        {!field.length && <p className="gbf-empty">Arrastra aquí cartas de tu mano para jugarlas · arrastra en vacío para seleccionar varias</p>}
      </div>

      <div className="gstrip">
        {/* Mano (se puede reordenar arrastrando) */}
        <div className="ghand" id="gHand" data-drop="hand">
          {priv.hand.map((c) => (
            <GCard key={c.iid} card={c} zone="hand" own priv={priv} />
          ))}
          {!priv.hand.length && <p className="gbf-empty">Mano vacía</p>}
          <span className="gzone-l">Mano · {priv.hand.length}</span>
        </div>

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
          {priv.library.length > 0 ? <div className="gback" /> : <div className="gpile-empty" />}
          <span className="gzone-n">{priv.library.length}</span>
          <span className="gzone-l">Biblioteca</span>
        </button>

        <Pile zone="graveyard" cards={pub.zones.graveyard} own priv={priv} />
        <Pile zone="exile" cards={pub.zones.exile} own priv={priv} />
        <Pile zone="command" cards={pub.zones.command} own priv={priv} casts={pub.casts} />
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
          </>
        )}
        <button type="button" className="plain small gback-me" onClick={() => game.setView(myId())}>
          Volver a mi mesa
        </button>
      </div>
      {!zones ? (
        <p className="note">Preparando su mesa…</p>
      ) : (
        <>
          <div className="gbf opp">
            {zones.battlefield.map((c) => (
              <GCard key={c.iid} card={c} zone="battlefield" uid={p.user_id} />
            ))}
            {!zones.battlefield.length && <p className="gbf-empty">Todavía no tiene cartas en el campo</p>}
          </div>
          <div className="gstrip">
            {/* Su mano, boca abajo: se ve cuántas cartas tiene, no cuáles. */}
            <div className="ghand opp" aria-label={`Mano de ${p.username}: ${plural(st.handCount || 0, 'carta', 'cartas')}`}>
              {Array.from({ length: Math.min(st.handCount || 0, 30) }, (_, i) => (
                <div key={i} className="gcard back">
                  <div className="gback" />
                </div>
              ))}
              {!st.handCount && <p className="gbf-empty">Sin cartas en la mano</p>}
              <span className="gzone-l">Mano · {st.handCount || 0}</span>
            </div>
            <div className="gzone glib" aria-label={`Biblioteca de ${p.username}, ${plural(st.libCount || 0, 'carta', 'cartas')}`}>
              {st.libCount ? <div className="gback" /> : <div className="gpile-empty" />}
              <span className="gzone-n">{st.libCount || 0}</span>
              <span className="gzone-l">Biblioteca</span>
            </div>
            <Pile zone="graveyard" cards={zones.graveyard} uid={p.user_id} owner={p.username} />
            <Pile zone="exile" cards={zones.exile} uid={p.user_id} owner={p.username} />
            <Pile zone="command" cards={zones.command} uid={p.user_id} owner={p.username} casts={st.casts} />
          </div>
        </>
      )}
    </div>
  )
}

interface PileProps {
  zone: PublicZone
  cards: TCard[]
  own?: boolean
  priv?: PrivateState | null
  uid?: string
  owner?: string
  casts?: Record<string, number>
}

/** Montón de cartas: se ve la de arriba y, al pulsarlo, todas. */
function Pile({ zone, cards, own = false, priv = null, uid, owner, casts }: PileProps) {
  const top = cards[cards.length - 1]
  const label = ZONE_LABEL[zone]

  function openAll(e: MouseEvent) {
    // En mis cartas, el clic en la de arriba lo gestiona la mesa (doble clic, arrastrar…).
    if (own && (e.target as Element).closest('.gcard')) return
    e.stopPropagation()
    game.openViewer(
      own
        ? { title: zone === 'graveyard' ? 'Tu cementerio' : zone === 'exile' ? 'Tu exilio' : 'Tu zona de mando', zone, owner: true }
        : { title: `${label} de ${owner}`, zone, owner: false, uid },
    )
  }

  const tax = top && casts?.[top.iid] ? 2 * casts[top.iid] : 0
  return (
    <div
      className={'gzone gpile' + (zone === 'command' ? ' gcmdz' : '')}
      data-drop={own ? zone : undefined}
      title={cards.length ? `${label}: ${plural(cards.length, 'carta', 'cartas')} · pulsa para verlas todas` : label}
      onClick={openAll}
    >
      {top ? (
        <GCard card={top} zone={zone} own={own} uid={uid} priv={priv}>
          {tax > 0 && <span className="gtag gtax">+{tax}</span>}
        </GCard>
      ) : (
        <div className="gpile-empty" />
      )}
      <span className="gzone-n">{cards.length}</span>
      <span className="gzone-l">{label}</span>
    </div>
  )
}
