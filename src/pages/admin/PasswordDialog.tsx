import { useEffect, useRef, useState, type FormEvent } from 'react'
import { sb } from '../../api/supabase'

export interface Account {
  id: string
  username: string
}

/** El administrador pone una contraseña nueva a una cuenta (no se puede ver la antigua). */
export function PasswordDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (account && !dlg.open) dlg.showModal()
    if (!account && dlg.open) dlg.close()
  }, [account])

  return (
    <dialog ref={ref} className="pw-dialog" aria-labelledby="pw-title" onClose={onClose}>
      {account && <PasswordForm key={account.id} account={account} onClose={onClose} />}
    </dialog>
  )
}

function PasswordForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok?: boolean }>({ text: '' })
  const [busy, setBusy] = useState(false)

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (pass.length < 6) return setMsg({ text: 'La contraseña debe tener al menos 6 caracteres.' })
    if (pass !== pass2) return setMsg({ text: 'Las contraseñas no coinciden.' })
    setBusy(true)
    setMsg({ text: '' })
    try {
      const res = await sb.rpc('admin_set_password', { target: account.id, new_password: pass })
      if (res.error) {
        const m = res.error.message
        setMsg({
          text: /no encontrado/i.test(m)
            ? 'Ese usuario ya no existe.'
            : /administradores|permission/i.test(m)
              ? 'Tu cuenta no tiene permiso para esto.'
              : 'No se ha podido cambiar: ' + m,
        })
        setBusy(false)
        return
      }
      setPass('')
      setPass2('')
      setMsg({ text: `Contraseña cambiada para «${account.username}».`, ok: true })
      setTimeout(onClose, 1500)
    } catch (err) {
      console.error(err)
      setMsg({ text: 'No se ha podido conectar con el servidor.' })
      setBusy(false)
    }
  }

  return (
    <form className="auth" noValidate onSubmit={submit}>
      <h2 id="pw-title">Nueva contraseña</h2>
      <p className="note">Para la cuenta «{account.username}».</p>
      <label className="field">
        Contraseña nueva
        <input type="password" autoComplete="new-password" required autoFocus value={pass} onChange={(e) => setPass(e.target.value)} />
      </label>
      <label className="field">
        Repite la contraseña
        <input type="password" autoComplete="new-password" required value={pass2} onChange={(e) => setPass2(e.target.value)} />
      </label>
      <p className="note">
        Al menos 6 caracteres. Si no es tu cuenta, se cerrarán sus sesiones abiertas y tendrá que entrar con la nueva.
      </p>
      <p className={'auth-msg' + (msg.ok ? ' ok' : '')} role="alert">
        {msg.text}
      </p>
      <div className="actions">
        <button type="button" className="plain" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="plain primary" disabled={busy}>
          Guardar
        </button>
      </div>
    </form>
  )
}
