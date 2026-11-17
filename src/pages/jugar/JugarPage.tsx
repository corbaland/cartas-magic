import { useEffect, useRef } from 'react'
import { Outlet, useMatch, useNavigate, useParams } from 'react-router'
import { errText, sb } from '../../api/supabase'
import { useAuth } from '../../auth/useAuth'
import { toast } from '../../lib/toast'
import './juego.css'

/** Sección Jugar: hace falta una cuenta. */
export function JugarPage() {
  const { ready, user, openLogin } = useAuth()
  const join = useMatch('/jugar/unirse/:code')
  const code = join?.params.code?.toUpperCase()

  // Con un enlace de invitación y sin sesión: se abre directamente la ventana de entrar.
  useEffect(() => {
    if (ready && !user && code) {
      openLogin('login', `Te han invitado a la sala ${code}. Entra en tu cuenta o crea una («Crear cuenta») para unirte.`)
    }
  }, [ready, user, code, openLogin])

  if (!ready) return <div className="page note">Cargando…</div>
  if (!user) {
    return (
      <div className="page">
        <div className="play-gate">
          <h1 className="admin-title">Jugar</h1>
          <p>
            {code
              ? `Te han invitado a la sala ${code}. Entra en tu cuenta o crea una para unirte.`
              : 'Para jugar con tus amigos necesitas una cuenta.'}
          </p>
          <div className="play-btns">
            <button type="button" className="plain primary" onClick={() => openLogin('login')}>
              Entrar
            </button>
            <button type="button" className="plain" onClick={() => openLogin('signup')}>
              Crear cuenta
            </button>
          </div>
        </div>
      </div>
    )
  }
  return <Outlet />
}

/** …/#/jugar/unirse/CODIGO: se une a la sala y entra en ella. */
export function JoinRoute() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    done.current = true
    void (async () => {
      const r = await sb.rpc('join_room', { room_code: code })
      if (r.error) {
        toast(errText(r.error), true)
        navigate('/jugar', { replace: true })
        return
      }
      toast('Te has unido a la sala.')
      navigate(`/jugar/sala/${r.data}`, { replace: true })
    })()
  }, [code, navigate])

  return <div className="page note">Uniéndote a la sala {code.toUpperCase()}…</div>
}
