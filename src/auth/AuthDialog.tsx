import { useEffect, useRef, useState, type FormEvent } from 'react'
import { EMAIL_DOMAIN, USERNAME, sb } from '../api/supabase'
import { authError, useAuth, type AuthMode } from './useAuth'
import './auth.css'

/** Ventana para entrar o crear una cuenta (usuario + contraseña). */
export function AuthDialog() {
  const dialog = useAuth((s) => s.dialog)
  const closeLogin = useAuth((s) => s.closeLogin)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (dialog && !dlg.open) dlg.showModal()
    if (!dialog && dlg.open) dlg.close()
  }, [dialog])

  return (
    <dialog ref={ref} className="auth-dialog" aria-labelledby="auth-title" onClose={closeLogin}>
      {dialog && <AuthForm key={dialog.mode + (dialog.info ?? '')} initialMode={dialog.mode} info={dialog.info} onDone={closeLogin} />}
    </dialog>
  )
}

function AuthForm({ initialMode, info, onDone }: { initialMode: AuthMode; info?: string; onDone: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [name, setName] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const signup = mode === 'signup'

  function switchMode(m: AuthMode) {
    setMode(m)
    setMsg('')
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    const user = name.trim().toLowerCase()
    if (!USERNAME.test(user)) return setMsg('El usuario debe tener de 3 a 20 caracteres: letras sin acentos, números, guion o guion bajo.')
    // También lo impide la base de datos; esto solo da un mensaje más claro.
    if (signup && user.includes('admin')) return setMsg('Ese nombre está reservado. Elige otro.')
    if (!pass) return setMsg('Escribe la contraseña.')
    if (signup && pass.length < 6) return setMsg('La contraseña debe tener al menos 6 caracteres.')
    if (signup && pass !== pass2) return setMsg('Las contraseñas no coinciden.')

    setBusy(true)
    setMsg('')
    try {
      const email = `${user}@${EMAIL_DOMAIN}`
      const res = signup
        ? await sb.auth.signUp({ email, password: pass, options: { data: { username: user } } })
        : await sb.auth.signInWithPassword({ email, password: pass })
      if (res.error) setMsg(authError(res.error))
      else if (!res.data.session) setMsg('La cuenta se ha creado, pero falta activar el acceso sin confirmar correo en Supabase.')
      else onDone()
    } catch (err) {
      setMsg('No se ha podido conectar con el servidor de cuentas.')
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="auth" noValidate onSubmit={submit}>
      <h2 id="auth-title">Tu cuenta</h2>
      {info && <p className="note">{info}</p>}
      <div className="tabs" role="tablist" aria-label="Entrar o crear cuenta">
        <button type="button" role="tab" aria-selected={!signup} onClick={() => switchMode('login')}>
          Entrar
        </button>
        <button type="button" role="tab" aria-selected={signup} onClick={() => switchMode('signup')}>
          Crear cuenta
        </button>
      </div>
      <label className="field">
        Usuario
        <input
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        Contraseña
        <input
          type="password"
          autoComplete={signup ? 'new-password' : 'current-password'}
          required
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
      </label>
      {signup && (
        <>
          <label className="field">
            Repite la contraseña
            <input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          </label>
          <p className="note">
            Usuario de 3 a 20 caracteres: letras sin acentos, números, guion o guion bajo. Contraseña de al menos 6 caracteres.
          </p>
        </>
      )}
      <p className="auth-msg" role="alert">
        {msg}
      </p>
      <div className="actions">
        <button type="button" className="plain" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="plain primary" disabled={busy}>
          {signup ? 'Crear cuenta' : 'Entrar'}
        </button>
      </div>
    </form>
  )
}
