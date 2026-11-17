import { useState } from 'react'
import { useDecks } from '../../features/decks/useDecks'
import { LIMIT, countCards, countTokens, deckToText, deckValue, type Deck } from '../../features/decks/rules'
import { eur } from '../../lib/format'
import { CardAdder } from './CardAdder'
import { DeckSections } from './DeckSections'
import { ImportDialog } from './ImportDialog'

/** Editor de un mazo: nombre, contador, buscador para añadir y secciones. */
export function DeckEditor({ deck, onDeleted }: { deck: Deck; onDeleted?: () => void }) {
  const { rename, remove, say, msg } = useDecks()
  const [importing, setImporting] = useState(false)
  const n = countCards(deck)

  async function copyList() {
    const text = deckToText(deck)
    if (!text) return say('El mazo está vacío: no hay nada que copiar.', true)
    try {
      await navigator.clipboard.writeText(text)
      say(`Lista copiada al portapapeles (${n} cartas).`)
    } catch {
      say('No se ha podido copiar la lista al portapapeles.', true)
    }
  }

  function del() {
    if (window.confirm(`¿Eliminar el mazo «${deck.name || 'Mazo sin nombre'}»? No se puede deshacer.`)) {
      remove()
      onDeleted?.()
    }
  }

  return (
    <>
      <div className="deck-head">
        <input
          className="deck-name"
          type="text"
          maxLength={60}
          aria-label="Nombre del mazo"
          value={deck.name}
          onChange={(e) => rename(e.target.value)}
        />
        <button type="button" className="plain" onClick={() => setImporting(true)}>
          Importar lista
        </button>
        <button type="button" className="plain" onClick={copyList}>
          Copiar lista
        </button>
        <button type="button" className="plain danger" onClick={del}>
          Eliminar mazo
        </button>
      </div>

      <div className={'counter' + (n >= LIMIT ? ' full' : '')} role="status" aria-live="polite">
        <div className="counter-top">
          <strong>
            {n} / {LIMIT}
          </strong>
          <span>{n >= LIMIT ? 'Mazo completo' : n === LIMIT - 1 ? 'Falta 1 carta' : `Faltan ${LIMIT - n} cartas`}</span>
          <span>Tokens: {countTokens(deck)}</span>
          <span>Valor aprox.: {eur(deckValue(deck))}</span>
        </div>
        <div className="meter">
          <div style={{ width: `${Math.min(100, (n / LIMIT) * 100)}%` }} />
        </div>
      </div>

      <CardAdder deck={deck} />
      <p className={'deck-msg' + (msg.bad ? ' bad' : '')} role="status" aria-live="polite">
        {msg.text}
      </p>

      <DeckSections deck={deck} />

      <ImportDialog deck={deck} open={importing} onClose={() => setImporting(false)} />
    </>
  )
}
