import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cardImage, searchToAdd, type Card } from '../../api/scryfall'
import { useDebounced } from '../../lib/useDebounced'
import { useDecks } from '../../features/decks/useDecks'
import { addCard, canCommand, frontType, sectionFor, type Deck } from '../../features/decks/rules'

/** Buscador para añadir cartas (o tokens) al mazo. */
export function CardAdder({ deck }: { deck: Deck }) {
  const apply = useDecks((s) => s.apply)
  const [text, setText] = useState('')
  const [tokens, setTokens] = useState(false)
  const q = useDebounced(text.trim(), 350)

  const results = useQuery({
    queryKey: ['add', q.toLowerCase(), tokens],
    queryFn: ({ signal }) => searchToAdd(q, tokens, signal),
    enabled: q.length >= 2,
  })

  return (
    <div className="adder">
      <div className="adder-row">
        <input
          type="search"
          placeholder="Añadir carta por nombre (en inglés)"
          autoComplete="off"
          aria-label="Buscar carta para añadir al mazo"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={tokens} onChange={(e) => setTokens(e.target.checked)} /> Buscar tokens
        </label>
      </div>
      {q.length >= 2 && results.isError && <p className="note bad">No se han podido buscar cartas. Inténtalo de nuevo.</p>}
      {q.length >= 2 && results.data?.length === 0 && <p className="note bad">Sin resultados para «{q}».</p>}
      {q.length >= 2 && !!results.data?.length && (
        <div className="add-results">
          {results.data.map((c) => (
            <Pick key={c.id} card={c} onAdd={(asCmd) => apply(addCard(deck, c, asCmd))} />
          ))}
        </div>
      )}
    </div>
  )
}

function Pick({ card, onAdd }: { card: Card; onAdd: (asCommander: boolean) => void }) {
  const isToken = sectionFor(card) === 'tokens'
  const src = cardImage(card, 'small')
  return (
    <div className="pick">
      {src && <img loading="lazy" src={src} alt="" data-zoom />}
      <div className="nm">{card.name}</div>
      <div className="tp">{frontType(card)}</div>
      <div className="btns">
        <button type="button" onClick={() => onAdd(false)}>
          {isToken ? 'Añadir token' : 'Añadir'}
        </button>
        {!isToken && canCommand(card) && (
          <button type="button" onClick={() => onAdd(true)}>
            ★ Comandante
          </button>
        )}
      </div>
    </div>
  )
}
