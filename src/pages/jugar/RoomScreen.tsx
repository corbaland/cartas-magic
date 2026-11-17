import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { errText, sb } from '../../api/supabase'
import { useDecks } from '../../features/decks/useDecks'
import { closeRoom, myId, openRoom, reloadRoom, useGame } from '../../features/game/store'
import { toast } from '../../lib/toast'
import { DeckSelect } from './DeckSelect'
import { Table } from './table/Table'

/** Enlace de invitación: al abrirlo con la sesión iniciada se entra en la sala. */
function joinLink(code: string): string {
  return `${location.origin}${location.pathname}#/jugar/unirse/${code}`
}

/** …/#/jugar/sala/:id: la sala antes de empezar o, si la partida está en marcha, la mesa. */
export function RoomRoute() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const room = useGame((s) => s.room)
  const lost = useGame((s) => s.lost)

  useEffect(() => {
    void openRoom(id)
    return () => closeRoom()
  }, [id])

  useEffect(() => {
    if (!lost) return
    toast(lost, true)
    closeRoom()
    navigate('/jugar', { replace: true })
  }, [lost, navigate])

  if (!room || room.id !== id) return <div className="page note">Cargando la sala…</div>
  if (room.status === 'playing') return <Table />
  return <RoomScreen />
}

function RoomScreen() {
  const navigate = useNavigate()
  const r = useGame((s) => s.room)!
  const players = useGame((s) => s.players)
  const decks = useDecks((s) => s.decks)
  const me = myId()
  const host = r.host_id === me
  const mine = players.find((p) => p.user_id === me)
  const [who, setWho] = useState('')

  async function chooseDeck(id: string) {
    const deck = decks.find((d) => d.id === id)
    const res = await sb
      .from('room_players')
      .update({ deck_id: deck?.id ?? null, deck_name: deck ? deck.name || 'Mazo sin nombre' : null, ready: false })
      .eq('room_id', r.id)
      .eq('user_id', me)
    if (res.error) toast(errText(res.error), true)
    void reloadRoom()
  }

  async function toggleReady() {
    if (!mine?.deck_id) return toast('Elige antes un mazo.', true)
    const res = await sb.from('room_players').update({ ready: !mine.ready }).eq('room_id', r.id).eq('user_id', me)
    if (res.error) toast(errText(res.error), true)
    void reloadRoom()
  }

  async function invite() {
    const name = who.trim()
    if (!name) return
    const res = await sb.rpc('invite_user', { rid: r.id, uname: name })
    if (res.error) return toast(errText(res.error), true)
    toast(`Invitación enviada a ${name}.`)
    setWho('')
  }

  async function copy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(ok)
    } catch {
      toast('No se ha podido copiar: ' + text, true)
    }
  }

  async function start() {
    const res = await sb.rpc('start_game', { rid: r.id })
    if (res.error) toast(errText(res.error), true)
  }

  async function leave() {
    if (!window.confirm(`¿Salir de la sala «${r.name}»?`)) return
    const res = await sb.rpc('leave_room', { rid: r.id })
    if (res.error) return toast(errText(res.error), true)
    navigate('/jugar')
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar la sala «${r.name}» para todos? No se puede deshacer.`)) return
    const res = await sb.rpc('delete_room', { rid: r.id })
    if (res.error) return toast(errText(res.error), true)
    navigate('/jugar')
  }

  const missing = players.filter((p) => !p.deck_id).length

  return (
    <div className="page play-room">
      <div className="play-head">
        <button type="button" className="plain small" onClick={() => navigate('/jugar')}>
          ← Salas
        </button>
        <h1 className="admin-title">{r.name}</h1>
      </div>

      <p className="play-code">
        Código de la sala: <strong>{r.code}</strong>
        <button type="button" className="plain small" onClick={() => void copy(r.code!, 'Código copiado.')}>
          Copiar código
        </button>
        <button
          type="button"
          className="plain small primary"
          onClick={() => void copy(joinLink(r.code!), 'Enlace copiado. Pásaselo a tus amigos: al abrirlo con su cuenta entran en la sala.')}
        >
          Copiar enlace de invitación
        </button>
      </p>

      <h2 className="play-h2">
        Jugadores ({players.length}/{r.max_players})
      </h2>
      <div className="play-list">
        {players.map((p) => (
          <div key={p.user_id} className="play-row">
            <div>
              <strong>{p.username}</strong>
              {p.user_id === r.host_id && <span className="badge-admin">Anfitrión</span>}
              <span className="note"> · {p.deck_name ? `mazo «${p.deck_name}»` : 'sin mazo elegido'}</span>
            </div>
            <span className={'play-ready' + (p.ready ? ' on' : '')}>{p.ready ? '✓ Listo' : 'Esperando'}</span>
          </div>
        ))}
      </div>

      <section className="play-box">
        <h2>Tu mazo</h2>
        <label className="field">
          Mazo para esta partida
          <DeckSelect value={mine?.deck_id ?? ''} onChange={(id) => void chooseDeck(id)} />
        </label>
        <button type="button" className={'plain' + (mine?.ready ? '' : ' primary')} onClick={() => void toggleReady()}>
          {mine?.ready ? 'Ya no estoy listo' : 'Estoy listo'}
        </button>
      </section>

      <section className="play-box">
        <h2>Invitar</h2>
        <label className="field">
          Usuario
          <input
            className="pinput"
            type="text"
            maxLength={20}
            placeholder="nombre de usuario"
            autoCapitalize="none"
            spellCheck={false}
            value={who}
            onChange={(e) => setWho(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void invite()}
          />
        </label>
        <button type="button" className="plain primary" onClick={() => void invite()}>
          Invitar
        </button>
        <p className="note">También pueden unirse con el enlace de invitación o escribiendo el código en Jugar → «Unirse con código».</p>
      </section>

      <div className="play-actions">
        {host ? (
          <button
            type="button"
            className="plain primary"
            disabled={missing > 0}
            title={missing ? 'Todos los jugadores tienen que elegir mazo' : undefined}
            onClick={() => void start()}
          >
            Empezar partida
          </button>
        ) : (
          <p className="note">El anfitrión empezará la partida cuando estéis listos.</p>
        )}
        <button type="button" className="plain" onClick={() => void leave()}>
          Salir de la sala
        </button>
        {host && (
          <button type="button" className="plain danger" onClick={() => void remove()}>
            Eliminar sala
          </button>
        )}
      </div>
    </div>
  )
}
