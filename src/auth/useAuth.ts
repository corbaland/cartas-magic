import type { User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { sb, type Profile } from '../api/supabase'

export type AuthMode = 'login' | 'signup'

interface AuthState {
  /** true cuando Supabase ya ha dicho si hay sesión o no. */
  ready: boolean
  user: User | null
  profile: Profile | null
  /** Ventana de entrar / crear cuenta. */
  dialog: { mode: AuthMode; info?: string } | null
  openLogin: (mode?: AuthMode, info?: string) => void
  closeLogin: () => void
}

export const useAuth = create<AuthState>((set) => ({
  ready: false,
  user: null,
  profile: null,
  dialog: null,
  openLogin: (mode = 'login', info) => set({ dialog: { mode, info } }),
  closeLogin: () => set({ dialog: null }),
}))

export function isAdmin(s: Pick<AuthState, 'user' | 'profile'>): boolean {
  return !!(s.user && s.profile?.is_admin)
}

export const useIsAdmin = () => useAuth((s) => isAdmin(s))

// Escucha la sesión de Supabase desde que arranca la web.
let token = 0
sb.auth.onAuthStateChange((_event, session) => {
  // Fuera del aviso de Supabase, para no bloquear su gestión de la sesión.
  setTimeout(() => void onUser(session?.user ?? null), 0)
})

async function onUser(u: User | null) {
  const prev = useAuth.getState().user
  if (u && prev && u.id === prev.id) return // solo se ha renovado la sesión
  const mine = ++token
  if (!u) {
    useAuth.setState({ ready: true, user: null, profile: null })
    return
  }
  useAuth.setState({ ready: true, user: u, profile: null })
  const p = await sb.from('profiles').select('username,is_admin').eq('id', u.id).maybeSingle()
  if (mine !== token) return
  useAuth.setState({
    profile: (p.data as Profile | null) ?? { username: (u.email ?? '').split('@')[0], is_admin: false },
  })
}

export function authError(err: unknown): string {
  const raw = (err as { message?: string } | null)?.message ?? ''
  const m = raw.toLowerCase()
  if (/invalid login credentials/.test(m)) return 'Usuario o contraseña incorrectos.'
  if (/already registered|already exists|database error saving new user/.test(m)) return 'Ese nombre de usuario ya está cogido.'
  if (/password/.test(m) && /(at least|short|weak|characters)/.test(m)) return 'La contraseña es demasiado corta: mínimo 6 caracteres.'
  if (/email not confirmed/.test(m)) return 'La cuenta existe pero aún no está activada.'
  if (/rate limit|too many/.test(m)) return 'Demasiados intentos seguidos. Espera un poco y vuelve a probar.'
  if (/signups? not allowed|disabled/.test(m)) return 'Ahora mismo no se pueden crear cuentas nuevas.'
  return 'No se ha podido completar: ' + (raw || 'error desconocido') + '.'
}
