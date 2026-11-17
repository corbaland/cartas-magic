import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { sb } from '../../api/supabase'
import { useAuth, useIsAdmin } from '../../auth/useAuth'
import { LIMIT, countCards, type Deck } from '../../features/decks/rules'
import { num, plural } from '../../lib/format'
import { PasswordDialog, type Account } from './PasswordDialog'
import './admin.css'

const day = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' })
const when = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

interface Person {
  id: string
  username: string
  is_admin: boolean
  created_at: string
}

interface AdminDeck extends Deck {
  user_id: string
  updated_at: string
}

interface AccountRow extends Account {
  is_admin: boolean
  created_at: string
  last_sign_in_at: string | null
  decks: number
}

async function loadAdmin() {
  const [people, decks, accounts] = await Promise.all([
    sb.from('profiles').select('id,username,is_admin,created_at').order('created_at'),
    sb.from('decks').select('id,user_id,name,cards,updated_at').order('updated_at', { ascending: false }),
    sb.rpc('admin_list_users'),
  ])
  const err = people.error || decks.error || accounts.error
  if (err) throw err
  return {
    people: people.data as Person[],
    decks: (decks.data as AdminDeck[]).map((d) => ({ ...d, cards: Array.isArray(d.cards) ? d.cards : [] })),
    accounts: accounts.data as AccountRow[],
  }
}

/** Panel de administración: solo lo ve la cuenta de administrador. */
export function AdminPage() {
  const ready = useAuth((s) => s.ready && (!s.user || !!s.profile))
  const admin = useIsAdmin()
  if (!ready) return <div className="page note">Cargando…</div>
  if (!admin) return <Navigate to="/" replace />
  return <AdminPanel />
}

function AdminPanel() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cuentas' ? 'cuentas' : 'mazos'
  const [pwFor, setPwFor] = useState<Account | null>(null)
  const data = useQuery({ queryKey: ['admin'], queryFn: loadAdmin, staleTime: 0 })

  const cardsTotal = data.data?.decks.reduce((n, d) => n + countCards(d), 0) ?? 0

  return (
    <div className="page">
      <h1 className="admin-title">Panel de administración</h1>
      <p className="note">Solo lo ve la cuenta de administrador. Aquí irán también las secciones de prueba.</p>

      {data.data && (
        <div className="stats">
          <Stat value={data.data.people.length} label={data.data.people.length === 1 ? 'usuario' : 'usuarios'} />
          <Stat value={data.data.decks.length} label={data.data.decks.length === 1 ? 'mazo' : 'mazos'} />
          <Stat value={cardsTotal} label="cartas en mazos" />
        </div>
      )}

      <div className="admin-bar">
        <div className="tabs admin-tabs" role="tablist" aria-label="Secciones de administración">
          {(['mazos', 'cuentas'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setParams(t === 'mazos' ? {} : { tab: t }, { replace: true })}
            >
              {t === 'mazos' ? 'Mazos' : 'Cuentas'}
            </button>
          ))}
        </div>
        <button type="button" className="plain small" disabled={data.isFetching} onClick={() => data.refetch()}>
          Actualizar
        </button>
      </div>

      {data.isPending && <p className="note">Cargando…</p>}
      {data.isError && <p className="note bad">No se han podido cargar los datos.</p>}

      {data.data && tab === 'mazos' && (
        <div className="users" role="tabpanel">
          {data.data.people.map((p) => {
            const mine = data.data.decks.filter((d) => d.user_id === p.id)
            return (
              <article key={p.id} className="user-card">
                <h3>
                  {p.username}
                  {p.is_admin && <span className="badge-admin">Admin</span>}
                </h3>
                <p className="meta">
                  Alta: {day.format(new Date(p.created_at))} · {plural(mine.length, 'mazo', 'mazos')}
                </p>
                {mine.map((d) => (
                  <details key={d.id}>
                    <summary>
                      {d.name || 'Mazo sin nombre'}{' '}
                      <small>
                        {countCards(d)}/{LIMIT} cartas · actualizado {day.format(new Date(d.updated_at))}
                      </small>
                    </summary>
                    <DeckList deck={d} />
                  </details>
                ))}
              </article>
            )
          })}
        </div>
      )}

      {data.data && tab === 'cuentas' && (
        <div role="tabpanel">
          <div className="table-wrap">
            <table className="accounts">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Alta</th>
                  <th>Último acceso</th>
                  <th>Mazos</th>
                  <th>Contraseña</th>
                </tr>
              </thead>
              <tbody>
                {data.data.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.username}</td>
                    <td>{a.is_admin ? <span className="badge-admin">Admin</span> : 'Usuario'}</td>
                    <td>{day.format(new Date(a.created_at))}</td>
                    {a.last_sign_in_at ? <td>{when.format(new Date(a.last_sign_in_at))}</td> : <td className="muted">Nunca</td>}
                    <td>{num(a.decks)}</td>
                    <td>
                      <button
                        type="button"
                        className="plain small"
                        aria-label={`Cambiar la contraseña de ${a.username}`}
                        onClick={() => setPwFor(a)}
                      >
                        Cambiar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Las contraseñas no se muestran: Supabase solo guarda una huella cifrada de cada una, de la que no se puede sacar la
            original. Con «Cambiar» puedes ponerle una nueva a quien la haya olvidado.
          </p>
        </div>
      )}

      <PasswordDialog account={pwFor} onClose={() => setPwFor(null)} />
    </div>
  )
}

/** Las cartas de un mazo como lista, con el comandante primero y sin tokens. */
function DeckList({ deck }: { deck: Deck }) {
  const cards = deck.cards
    .filter((c) => c.sec !== 'tokens')
    .sort((a, b) => Number(b.sec === 'comandante') - Number(a.sec === 'comandante') || a.name.localeCompare(b.name))
  return (
    <ol>
      {cards.map((c) => (
        <li key={c.sec + c.id + c.name}>
          {c.qty} {c.name}
          {c.sec === 'comandante' ? ' (comandante)' : ''}
        </li>
      ))}
      {!cards.length && <li>Vacío</li>}
    </ol>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <strong>{num(value)}</strong>
      <span>{label}</span>
    </div>
  )
}
