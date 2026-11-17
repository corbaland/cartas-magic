import { useState } from 'react'
import { useNavigate } from 'react-router'
import { sb } from '../api/supabase'
import { useDecks } from '../features/decks/useDecks'
import { useAuth, useIsAdmin } from './useAuth'

/** Zona de la cabecera: «Entrar» o el usuario con el botón «Salir». */
export function AccountArea() {
  const { ready, user, profile, openLogin } = useAuth()
  const admin = useIsAdmin()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  if (!user) {
    return (
      <div className="account">
        <button type="button" className="plain small" disabled={!ready} onClick={() => openLogin('login')}>
          Entrar
        </button>
      </div>
    )
  }

  async function logout() {
    setBusy(true)
    try {
      await useDecks.getState().flush() // sube lo pendiente antes de salir
      await sb.auth.signOut()
    } finally {
      setBusy(false)
    }
    navigate('/')
  }

  return (
    <div className="account">
      <span className="who" title={profile?.username}>
        {profile?.username ?? ''}
      </span>
      {admin && <span className="badge-admin">Admin</span>}
      <button type="button" className="plain small" disabled={busy} onClick={logout}>
        Salir
      </button>
    </div>
  )
}
