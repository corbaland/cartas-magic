/*
 * Acceso a la API pública de Scryfall (https://scryfall.com/docs/api).
 * Solo se usan los campos que necesita la web.
 */

const API = 'https://api.scryfall.com'

export type ImageSize = 'small' | 'normal' | 'large'

export interface ImageUris {
  small: string
  normal: string
  large: string
}

export interface CardFace {
  name: string
  oracle_text?: string
  image_uris?: ImageUris
  illustration_id?: string
}

export interface Prices {
  eur: string | null
  eur_foil: string | null
  usd: string | null
  usd_foil: string | null
  tix: string | null
}

export interface Card {
  id: string
  name: string
  type_line?: string
  oracle_text?: string
  set_name: string
  rarity?: string
  released_at?: string
  collector_number?: string
  artist?: string
  illustration_id?: string
  image_uris?: ImageUris
  card_faces?: CardFace[]
  prices: Prices
  purchase_uris?: { cardmarket?: string; tcgplayer?: string }
  scryfall_uri?: string
  prints_search_uri?: string
}

export interface CardList {
  data: Card[]
  has_more: boolean
  next_page?: string
  total_cards?: number
}

/** Error de Scryfall con el código HTTP, para dar mensajes claros. */
export class ScryfallError extends Error {
  status: number
  constructor(status: number) {
    super('Scryfall HTTP ' + status)
    this.status = status
  }
}

const SCRYFALL_URL = /^https:\/\/api\.scryfall\.com\//

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (!SCRYFALL_URL.test(url)) throw new Error('URL no permitida: ' + url)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new ScryfallError(res.status)
  return res.json() as Promise<T>
}

export type SortKey = 'name:asc' | 'eur:desc' | 'eur:asc' | 'released:desc'

/** URL de la primera página de una búsqueda por nombre. */
export function searchUrl(text: string, sort: SortKey, exact: boolean): string {
  const [order, dir] = sort.split(':')
  const clean = text.trim()
  let q = clean || 'game:paper'
  if (clean && exact && !clean.includes('"')) q = `!"${clean}"`
  const params = new URLSearchParams({ q, unique: 'cards', order, dir })
  return `${API}/cards/search?${params}`
}

/** Una página de resultados. Si no hay ninguno (404) devuelve una lista vacía. */
export async function fetchCardPage(url: string, signal?: AbortSignal): Promise<CardList> {
  try {
    return await getJson<CardList>(url, signal)
  } catch (err) {
    if (err instanceof ScryfallError && err.status === 404) {
      return { data: [], has_more: false, total_cards: 0 }
    }
    throw err
  }
}

/** Nombres de cartas que coinciden con lo escrito (hasta 20). */
export async function autocomplete(text: string, signal?: AbortSignal): Promise<string[]> {
  const data = await getJson<{ data: string[] }>(`${API}/cards/autocomplete?q=${encodeURIComponent(text)}`, signal)
  return data.data
}

/** Todas las ediciones de una carta (primera página, las más recientes). */
export function fetchPrints(card: Card, signal?: AbortSignal): Promise<CardList> {
  if (!card.prints_search_uri) return Promise.resolve({ data: [card], has_more: false, total_cards: 1 })
  return getJson<CardList>(card.prints_search_uri, signal)
}

export function fetchCard(id: string, signal?: AbortSignal): Promise<Card> {
  return getJson<Card>(`${API}/cards/${encodeURIComponent(id)}`, signal)
}

/** Imagen de una carta por su nombre exacto (sirve directamente como src). */
export function namedImageUrl(name: string): string {
  return `${API}/cards/named?format=image&version=normal&exact=${encodeURIComponent(name)}`
}

export function cardImage(card: Card, size: ImageSize): string | null {
  return card.image_uris?.[size] ?? card.card_faces?.[0]?.image_uris?.[size] ?? null
}

/** Dos ediciones con la misma ilustración comparten clave. */
export function artKey(card: Card): string {
  return card.illustration_id ?? card.card_faces?.[0]?.illustration_id ?? card.id
}

export function oracleText(card: Card): string | null {
  if (card.oracle_text != null) return card.oracle_text
  if (card.card_faces) return card.card_faces.map((f) => f.name + '\n' + (f.oracle_text ?? '')).join('\n\n')
  return null
}

export function errorMessage(err: unknown): string {
  if (err instanceof ScryfallError && err.status === 429) {
    return 'Demasiadas búsquedas seguidas. Espera unos segundos e inténtalo de nuevo.'
  }
  return 'No se han podido cargar las cartas. Comprueba tu conexión e inténtalo de nuevo.'
}
