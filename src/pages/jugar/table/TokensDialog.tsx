import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cardImage, fetchCardPage, fetchCollection } from '../../../api/scryfall'
import { game, useGame } from '../../../features/game/store'
import type { PrivateState, PublicState, TokenBase } from '../../../features/game/types'
import { safeImg } from '../../../features/game/util'
import { useDebounced } from '../../../lib/useDebounced'

async function searchTokens(text: string, signal?: AbortSignal): Promise<TokenBase[]> {
  const params = new URLSearchParams({ q: `${text} t:token`, include_extras: 'true', unique: 'art', order: 'name' })
  const data = await fetchCardPage(`https://api.scryfall.com/cards/search?${params}`, signal)
  // Primero las que se llaman exactamente así, luego las que empiezan así.
  const low = text.toLowerCase()
  const rank = (n: string) => (n.toLowerCase() === low ? 0 : n.toLowerCase().startsWith(low) ? 1 : 2)
  return data.data
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .slice(0, 24)
    .map((c) => ({ id: c.id, name: c.name, img: cardImage(c, 'small'), type: c.type_line }))
}

/** Ids de Scryfall de todas mis cartas en la partida (sin fichas). */
function myCardIds(pub: PublicState | null, priv: PrivateState | null): string[] {
  if (!pub || !priv) return []
  const all = [
    ...priv.library,
    ...priv.hand,
    ...Object.values(priv.hidden),
    ...pub.zones.battlefield,
    ...pub.zones.graveyard,
    ...pub.zones.exile,
    ...pub.zones.command,
  ]
  return [...new Set(all.filter((c) => !c.token && c.id).map((c) => c.id!))].sort()
}

/** Las fichas que pueden crear las cartas del mazo (según Scryfall). */
async function deckTokens(ids: string[]): Promise<TokenBase[]> {
  const cards = await fetchCollection(ids.map((id) => ({ id })))
  const tokenIds = new Map<string, string>() // nombre → id (una por nombre)
  for (const c of cards) {
    for (const part of c.all_parts ?? []) {
      if (part.component === 'token' && part.id !== c.id && !tokenIds.has(part.name)) tokenIds.set(part.name, part.id)
    }
  }
  if (!tokenIds.size) return []
  const tokens = await fetchCollection([...tokenIds.values()].map((id) => ({ id })))
  return tokens
    .map((t) => ({ id: t.id, name: t.name, img: cardImage(t, 'small'), type: t.type_line }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Crear una ficha: las que crean las cartas de mi mazo, o cualquiera buscándola. */
export function TokensDialog() {
  const open = useGame((s) => s.tokensOpen)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])

  return (
    <dialog ref={ref} className="gviewer" onClose={() => game.openTokens(false)}>
      {open && <TokensBody />}
    </dialog>
  )
}

function TokensBody() {
  const pub = useGame((s) => s.pub)
  const priv = useGame((s) => s.priv)
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 350)
  const ids = myCardIds(pub, priv)

  const mine = useQuery({
    queryKey: ['deck-tokens', ids.join(',')],
    queryFn: () => deckTokens(ids),
    enabled: ids.length > 0,
    staleTime: Infinity,
  })
  const results = useQuery({
    queryKey: ['tokens', q.toLowerCase()],
    queryFn: ({ signal }) => searchTokens(q, signal),
    enabled: q.length >= 2,
  })

  // Las del mazo: las que crean sus cartas y las que se guardaron en su sección «Tokens».
  const deckList: TokenBase[] = []
  const seen = new Set<string>()
  for (const t of [...(mine.data ?? []), ...(pub?.tokens ?? [])]) {
    if (seen.has(t.name)) continue
    seen.add(t.name)
    deckList.push(t)
  }

  function pick(t: TokenBase) {
    game.createToken(t)
    game.openTokens(false)
  }

  return (
    <>
      <div className="gv-head">
        <h2>Crear ficha</h2>
        <button type="button" className="plain small" onClick={() => game.openTokens(false)}>
          Cerrar
        </button>
      </div>
      <div className="gv-body">
        <input className="pinput" type="search" maxLength={40} placeholder="Buscar ficha: Treasure, Soldier, Zombie…" aria-label="Buscar ficha" autoFocus value={text} onChange={(e) => setText(e.target.value)} />

        {q.length >= 2 ? (
          <>
            <h3 className="gv-h3">Resultados</h3>
            <p className="note">
              {results.isFetching ? 'Buscando…' : results.isError ? 'No se ha podido buscar.' : results.data?.length === 0 ? 'Sin resultados.' : ''}
            </p>
            <div className="gv-grid">{results.data?.map((t) => <TokenPick key={t.id} t={t} onPick={pick} />)}</div>
          </>
        ) : (
          <>
            <h3 className="gv-h3">Fichas que crean las cartas de tu mazo {deckList.length > 0 && <small className="note">({deckList.length})</small>}</h3>
            {mine.isPending && ids.length > 0 && <p className="note">Buscando las fichas de tu mazo…</p>}
            {mine.isError && <p className="note bad">No se han podido buscar las fichas de tu mazo.</p>}
            {!mine.isPending && !deckList.length && <p className="note">Ninguna carta de tu mazo crea fichas. Búscalas arriba por su nombre.</p>}
            <div className="gv-grid">
              {deckList.map((t) => (
                <TokenPick key={t.id} t={t} onPick={pick} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function TokenPick({ t, onPick }: { t: TokenBase; onPick: (t: TokenBase) => void }) {
  const src = safeImg(t.img)
  return (
    <button type="button" className="gv-pick" onClick={() => onPick(t)}>
      {src && <img src={src} alt="" loading="lazy" data-zoom />}
      <span>{t.name}</span>
    </button>
  )
}
