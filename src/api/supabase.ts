import { createClient } from '@supabase/supabase-js'

/*
 * Conexión con Supabase (cuentas, mazos y partidas).
 * La clave es pública a propósito: lo que cada usuario puede ver o cambiar
 * lo deciden las reglas de seguridad de la base de datos, no esta web.
 */
const SB_URL = 'https://jzunhuxwcddttopuvoym.supabase.co'
const SB_KEY = 'sb_publishable_H0XcfMJ2Cq7O2s-pdnCrng_DutvJJsI'

export const sb = createClient(SB_URL, SB_KEY)

// Se entra con usuario y contraseña; por debajo Supabase necesita un correo,
// así que se usa uno inventado a partir del nombre (nunca se envía nada).
export const EMAIL_DOMAIN = 'usuarios.cartas-magic.app'
export const USERNAME = /^[a-z0-9_-]{3,20}$/

export interface Profile {
  username: string
  is_admin: boolean
}

export function errText(err: unknown): string {
  const m = (err as { message?: string } | null)?.message || 'error desconocido'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión con el servidor.'
  return m
}
