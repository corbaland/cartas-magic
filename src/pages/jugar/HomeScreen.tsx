import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { errText, sb } from '../../api/supabase'
import { useAuth, useIsAdmin } from '../../auth/useAuth'
import { useDecks } from '../../features/decks/useDecks'
import { closeRoom, startPractice, useGame } from '../../features/game/store'
import type { Invite, Room } from '../../features/game/types'
import { toast } from '../../lib/toast'
import { DeckSelect } from './DeckSelect'

async function loadHome(uid: string) {
  const [rooms, invites] = await Promise.all([
    sb.from('room_players').select('room_id, rooms(id, code, name, status, host_id, max_players, created_at)').eq('user_id', uid),
    sb.from('room_invites').select('room_id, invited_by_name, created_at, rooms(id, code, name, status, max_players)').eq('user_id', uid),
  ])
  if (rooms.error || invites.error) throw rooms.error || invites.error
  return {
    rooms: (rooms.data as unknown as { rooms: Room | null }[])
      .map((r) => r.rooms)
      .filter((r): r is Room => !!r)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    invites: (invites.data as unknown as Invite[]).filter((i) => i.rooms),
  }
}

/** Pantalla inicial de Jugar: crear sala, unirse, invitaciones y mis salas. */
export function HomeScreen() {
  const uid = useAuth((s) => s.user!.id)
  const host = useIsAdmin() // de momento, crear salas y practicar es solo para el administrador
  const decks = useDecks((s) => s.decks)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const home = useQuery({ queryKey: ['jugar-home', uid], queryFn: () => loadHome(uid), staleTime: 0 })

  // Al volver aquí desde una práctica, esta se termina.
  useEffect(() => {
    if (useGame.getState().practice) closeRoom()
  }, [])

  // Las invitaciones llegan al momento.
  useEffect(() => {
    const ch = sb
      .channel('invitaciones-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_invites', filter: 'user_id=eq.' + uid }, () => {
        void queryClient.invalidateQueries({ queryKey: ['jugar-home', uid] })
      })
      .subscribe()
    return () => {
      void sb.removeChannel(ch)
    }
  }, [uid, queryClient])

  const [name, setName] = useState('')
  const [max, setMax] = useState('4')
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [practiceDeck, setPracticeDeck] = useState('')

  async function create() {
    setCreating(true)
    const r = await sb.rpc('create_room', { room_name: name, max_p: parseInt(max, 10) })
    setCreating(false)
    if (r.error) return toast(errText(r.error), true)
    navigate(`/jugar/sala/${r.data}`)
  }

  async function join(roomCode: string) {
    if (roomCode.trim().length < 6) return toast('El código tiene 6 caracteres.', true)
    const r = await sb.rpc('join_room', { room_code: roomCode })
    if (r.error) return toast(errText(r.error), true)
    navigate(`/jugar/sala/${r.data}`)
  }

  async function reject(roomId: string) {
    const r = await sb.from('room_invites').delete().eq('room_id', roomId).eq('user_id', uid)
    if (r.error) toast(errText(r.error), true)
    void home.refetch()
  }

  function practice() {
    const deck = decks.find((d) => d.id === practiceDeck)
    if (!deck) return toast('Elige un mazo. Si no tienes, créalo en la sección Mazos.', true)
    startPractice(deck)
    navigate('/jugar/practica')
  }

  const rooms = home.data?.rooms ?? []
  const invites = home.data?.invites ?? []

  return (
    <div className="page play-home">
      <h1 className="admin-title">Jugar</h1>
      <p className="note">
        {host
          ? 'Partidas de Commander en tiempo real con tus amigos. Crea una sala y pásales el enlace o el código, o invítalos por su nombre de usuario.'
          : 'Partidas de Commander en tiempo real con tus amigos. Únete a una sala con el código o el enlace que te pasen, o aceptando una invitación.'}
      </p>
      {home.isError && <p className="note bad">No se han podido cargar tus salas.</p>}
      {!decks.length && <p className="note">Para jugar necesitas al menos un mazo: créalo o impórtalo en la sección Mazos.</p>}

      <div className="play-grid">
        {host && (
          <section className="play-box">
            <h2>Crear sala</h2>
            <label className="field">
              Nombre
              <input className="pinput" type="text" maxLength={60} placeholder="Sala de…" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              Máximo de jugadores
              <select className="pinput" value={max} onChange={(e) => setMax(e.target.value)}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} jugadores
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="plain primary" disabled={creating} onClick={create}>
              Crear sala
            </button>
          </section>
        )}

        <section className="play-box">
          <h2>Unirse con código</h2>
          <label className="field">
            Código de la sala
            <input
              className="pinput"
              type="text"
              maxLength={6}
              placeholder="ABC123"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void join(code)}
            />
          </label>
          <button type="button" className="plain primary" onClick={() => void join(code)}>
            Unirse
          </button>
        </section>

        {host && (
          <section className="play-box">
            <h2>Práctica en solitario</h2>
            <p className="note">Prueba un mazo en la mesa sin nadie más. No se guarda.</p>
            <label className="field">
              Mazo
              <DeckSelect value={practiceDeck} onChange={setPracticeDeck} />
            </label>
            <button type="button" className="plain primary" onClick={practice}>
              Empezar
            </button>
          </section>
        )}
      </div>

      {invites.length > 0 && (
        <>
          <h2 className="play-h2">Invitaciones</h2>
          <div className="play-list">
            {invites.map((i) => (
              <div key={i.room_id} className="play-row">
                <div>
                  <strong>{i.rooms.name}</strong>
                  <span className="note">
                    {' '}
                    · te invita {i.invited_by_name || 'alguien'}
                    {i.rooms.status === 'playing' ? ' · la partida ya ha empezado' : ''}
                  </span>
                </div>
                <div className="play-btns">
                  <button type="button" className="plain small primary" onClick={() => void join(i.rooms.code)}>
                    Aceptar
                  </button>
                  <button type="button" className="plain small" onClick={() => void reject(i.room_id)}>
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="play-h2">Mis salas</h2>
      {home.isPending ? (
        <p className="note">Cargando…</p>
      ) : !rooms.length ? (
        <p className="note">Aún no estás en ninguna sala.</p>
      ) : (
        <div className="play-list">
          {rooms.map((r) => (
            <div key={r.id} className="play-row">
              <div>
                <strong>{r.name}</strong>
                <span className="note">
                  {' '}
                  · código {r.code} · {r.status === 'playing' ? 'partida en curso' : 'esperando jugadores'}
                  {r.host_id === uid ? ' · eres el anfitrión' : ''}
                </span>
              </div>
              <div className="play-btns">
                <button type="button" className="plain small primary" onClick={() => navigate(`/jugar/sala/${r.id}`)}>
                  {r.status === 'playing' ? 'Volver a la partida' : 'Entrar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
