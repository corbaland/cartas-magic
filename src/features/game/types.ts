/* Tipos de las salas y de la mesa de juego (tablas de Supabase del esquema «Jugar»). */

export type RoomStatus = 'lobby' | 'playing' | 'finished'

export interface Room {
  id: string | null // null en la práctica en solitario
  code?: string
  name: string
  host_id: string
  status: RoomStatus
  max_players?: number
  turn_user: string | null
  turn_number: number
  created_at?: string
  updated_at?: string
}

export interface RoomPlayer {
  room_id?: string
  user_id: string
  username: string
  seat: number
  deck_id?: string | null
  deck_name?: string | null
  ready?: boolean
}

export interface Invite {
  room_id: string
  invited_by_name: string | null
  created_at: string
  rooms: { id: string; code: string; name: string; status: RoomStatus; max_players: number }
}

export type Zone = 'hand' | 'library' | 'battlefield' | 'graveyard' | 'exile' | 'command'
export type PublicZone = 'battlefield' | 'graveyard' | 'exile' | 'command'

/** Una carta en la mesa. Si está boca abajo (fd), lo público solo guarda su posición. */
export interface TCard {
  iid: string // id único en esta partida
  id?: string // id de Scryfall
  name?: string
  img?: string | null
  imgBack?: string | null
  type?: string
  cmd?: boolean
  token?: boolean
  fd?: boolean
  flipped?: boolean
  x?: number
  y?: number
  tapped?: boolean
  counters?: Record<string, number>
}

export interface TokenBase {
  id: string
  name: string
  img: string | null
  type?: string
}

/** Lo que ven todos de un jugador. */
export interface PublicState {
  deckName: string
  life: number
  poison: number
  cmdDmg: Record<string, number>
  casts: Record<string, number>
  mulligans: number
  tokens: TokenBase[]
  zones: Record<PublicZone, TCard[]>
  handCount: number
  libCount: number
}

/** Lo que solo ve el propio jugador. */
export interface PrivateState {
  library: TCard[]
  hand: TCard[]
  hidden: Record<string, TCard>
}

export interface LogCard {
  name?: string
  img?: string | null
}

export interface LogEntry {
  id: number | string
  kind: 'action' | 'chat' | 'system'
  user_id?: string | null
  username?: string | null
  text: string
  data?: { cards?: LogCard[]; dice?: { sides: number; value: number } } | null
}
