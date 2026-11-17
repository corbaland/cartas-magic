import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchCard, type Card } from '../../api/scryfall'
import { CardDetail } from '../../components/CardDetail'
import { useDecks } from '../../features/decks/useDecks'
import {
  LIMIT,
  SECTIONS,
  changePrint,
  changeQty,
  makeCommander,
  removeCard,
  type Deck,
  type DeckCard,
  type SectionKey,
} from '../../features/decks/rules'
import { eur } from '../../lib/format'

const EMPTY: Partial<Record<SectionKey, string>> = {
  comandante: 'Busca una criatura legendaria y pulsa «★ Comandante».',
  tokens: 'Marca «Buscar tokens» para añadirlos.',
}

/** Las cartas del mazo por secciones, en grande, como en EDHPlay. */
export function DeckSections({ deck }: { deck: Deck }) {
  const { apply, say } = useDecks()
  const queryClient = useQueryClient()
  // Ficha abierta: la carta de Scryfall y su entrada en el mazo (para cambiarle el arte).
  const [open, setOpen] = useState<{ card: Card; entryId: string } | null>(null)

  async function openCard(entry: DeckCard) {
    try {
      const card = await queryClient.fetchQuery({ queryKey: ['card', entry.id], queryFn: ({ signal }) => fetchCard(entry.id, signal) })
      setOpen({ card, entryId: entry.id })
    } catch {
      say('No se ha podido abrir la carta.', true)
    }
  }

  function pickPrint(print: Card) {
    if (!open) return
    const entry = deck.cards.find((c) => c.id === open.entryId)
    if (!entry) return
    apply(changePrint(deck, entry, print))
    setOpen({ card: open.card, entryId: print.id })
  }

  return (
    <div className="deck-sections">
      {SECTIONS.map(({ key, label }) => {
        const cards = deck.cards.filter((c) => c.sec === key).sort((a, b) => a.name.localeCompare(b.name))
        const total = cards.reduce((t, c) => t + c.qty, 0)
        return (
          <section key={key} className={'sec' + (key === 'comandante' ? ' cmd' : '')}>
            <h3>
              {label}{' '}
              <small>{key === 'tokens' ? `${total} · no cuentan para las ${LIMIT}` : key === 'comandante' ? `${total} / 1` : total}</small>
            </h3>
            {cards.length ? (
              <ul>
                {cards.map((c) => (
                  <Tile
                    key={c.sec + c.id + c.name}
                    entry={c}
                    onOpen={openCard}
                    onQty={(delta) => apply(changeQty(deck, c, delta))}
                    onCommander={() => apply(makeCommander(deck, c))}
                    onRemove={() => apply(removeCard(deck, c))}
                  />
                ))}
              </ul>
            ) : (
              <p className="note">{EMPTY[key] ?? 'Sin cartas todavía.'}</p>
            )}
          </section>
        )
      })}
      <CardDetail card={open?.card ?? null} onClose={() => setOpen(null)} onPick={pickPrint} />
    </div>
  )
}

interface TileProps {
  entry: DeckCard
  onOpen: (e: DeckCard) => void
  onQty: (delta: 1 | -1) => void
  onCommander: () => void
  onRemove: () => void
}

function Tile({ entry: c, onOpen, onQty, onCommander, onRemove }: TileProps) {
  const isToken = c.sec === 'tokens'
  return (
    <li className="tile">
      {/* La carta en grande: al pulsarla se abre la ficha con precios, ediciones y artes. */}
      <button
        type="button"
        className="art"
        title={`${c.name} · ver ficha, precios y artes`}
        aria-label={`${c.name}: ver ficha, precios y artes`}
        data-zoom
        onClick={() => onOpen(c)}
      >
        {c.img ? <img loading="lazy" alt="" src={c.img.replace('/small/', '/normal/')} /> : <span className="noimg">{c.name}</span>}
        {c.qty > 1 && <span className="badge">×{c.qty}</span>}
      </button>
      <div className="tbar">
        <span className="eur">{c.eur != null && !isToken ? eur(Number(c.eur) * c.qty) : ''}</span>
        {/* Solo las tierras básicas y los tokens admiten varias copias. */}
        {(c.basic || isToken) && (
          <>
            <IconButton label={`Quitar una copia de ${c.name}`} onClick={() => onQty(-1)}>
              −
            </IconButton>
            <IconButton label={`Añadir otra copia de ${c.name}`} onClick={() => onQty(1)}>
              +
            </IconButton>
          </>
        )}
        {c.cmd && c.sec !== 'comandante' && (
          <IconButton label={`Hacer comandante a ${c.name}`} onClick={onCommander}>
            ★
          </IconButton>
        )}
        <IconButton label={`Quitar ${c.name} del mazo`} className="del" onClick={onRemove}>
          ✕
        </IconButton>
      </div>
    </li>
  )
}

function IconButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={'ico' + (className ? ' ' + className : '')} title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}
