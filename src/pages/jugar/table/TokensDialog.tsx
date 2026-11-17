import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cardImage, fetchCardPage } from '../../../api/scryfall'
import { game, useGame } from '../../../features/game/store'
import type { TokenBase } from '../../../features/game/types'
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

/** Crear una ficha: las de mi mazo o cualquiera buscándola. */
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
  const deckTokens = useGame((s) => s.pub?.tokens ?? [])
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 350)
  const results = useQuery({
    queryKey: ['tokens', q.toLowerCase()],
    queryFn: ({ signal }) => searchTokens(q, signal),
    enabled: q.length >= 2,
  })

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
        {deckTokens.length > 0 && (
          <>
            <h3 className="gv-h3">Fichas de tu mazo</h3>
            <div className="gv-grid">
              {deckTokens.map((t) => (
                <TokenPick key={t.id} t={t} onPick={pick} />
              ))}
            </div>
          </>
        )}
        <h3 className="gv-h3">Buscar ficha</h3>
        <input className="pinput" type="search" maxLength={40} placeholder="Treasure, Soldier, Zombie…" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        {q.length >= 2 && (
          <p className="note">
            {results.isFetching ? 'Buscando…' : results.isError ? 'No se ha podido buscar.' : results.data?.length === 0 ? 'Sin resultados.' : ''}
          </p>
        )}
        <div className="gv-grid">
          {q.length >= 2 && results.data?.map((t) => <TokenPick key={t.id} t={t} onPick={pick} />)}
        </div>
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
