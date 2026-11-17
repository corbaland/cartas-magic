import type { Zone } from './types'

export const START_LIFE = 40
export const HAND_SIZE = 7

const IMG_OK = /^https:\/\/cards\.scryfall\.io\//

/** Solo se aceptan imágenes de Scryfall (los datos de otros jugadores no son de fiar). */
export function safeImg(url: unknown): string | null {
  return typeof url === 'string' && IMG_OK.test(url) ? url : null
}

export function randInt(n: number): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] % n
}

export function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

export function newIid(): string {
  const a = new Uint32Array(2)
  crypto.getRandomValues(a)
  return a[0].toString(36) + a[1].toString(36)
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}

export const FROM: Record<Zone, string> = {
  hand: 'de la mano',
  library: 'de la biblioteca',
  battlefield: 'del campo de batalla',
  graveyard: 'del cementerio',
  exile: 'del exilio',
  command: 'de la zona de mando',
}

export const TO: Record<Zone, string> = {
  hand: 'a la mano',
  library: 'a la parte de arriba de la biblioteca',
  battlefield: 'al campo de batalla',
  graveyard: 'al cementerio',
  exile: 'al exilio',
  command: 'a la zona de mando',
}

/** Pide un número con la ventana del navegador. 0 si se cancela. */
export function askNumber(msg: string, def: number, max?: number): number {
  const v = window.prompt(msg, String(def))
  if (v === null) return 0
  const n = parseInt(v, 10)
  if (!(n > 0)) return 0
  return Math.min(n, max || 99)
}
