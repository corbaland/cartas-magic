import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { artKey, cardImage, fetchPrints, oracleText, type Card } from '../api/scryfall'
import { eur, num, usd } from '../lib/format'
import './CardDetail.css'

interface Props {
  card: Card | null
  onClose: () => void
  /** Si se indica, elegir un arte o una edición la «usa» (por ejemplo, en un mazo). */
  onPick?: (print: Card) => void
}

/** Ficha de una carta: imagen, texto, precios, otros artes y precios por edición. */
export function CardDetail({ card, onClose, onPick }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (card && !dlg.open) dlg.showModal()
    if (!card && dlg.open) dlg.close()
  }, [card])

  return (
    <dialog
      ref={ref}
      className="card-detail"
      aria-labelledby="card-detail-name"
      onClose={onClose}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onClose() // clic en el fondo
      }}
    >
      {card && <DetailBody key={card.id} card={card} onClose={onClose} onPick={onPick} />}
    </dialog>
  )
}

function DetailBody({ card, onClose, onPick }: { card: Card; onClose: () => void; onPick?: (p: Card) => void }) {
  const [shown, setShown] = useState<Card>(card)
  const [picked, setPicked] = useState<string | null>(null)
  const prints = useQuery({
    queryKey: ['prints', card.prints_search_uri ?? card.id],
    queryFn: ({ signal }) => fetchPrints(card, signal),
  })

  function pick(p: Card) {
    setShown(p)
    if (onPick) {
      onPick(p)
      setPicked(p.set_name)
    }
  }

  const src = cardImage(shown, 'large') ?? cardImage(shown, 'normal')
  const text = oracleText(card)
  const rows = [
    ['Cardmarket', eur(card.prices.eur)],
    ['Cardmarket (foil)', eur(card.prices.eur_foil)],
    ['TCGplayer', usd(card.prices.usd)],
    ['TCGplayer (foil)', usd(card.prices.usd_foil)],
    ['Magic Online (tix)', num(card.prices.tix)],
  ].filter((r): r is [string, string] => r[1] != null)
  const links = [
    ['Ver en Scryfall', card.scryfall_uri],
    ['Comprar en Cardmarket', card.purchase_uris?.cardmarket],
    ['Comprar en TCGplayer', card.purchase_uris?.tcgplayer],
  ].filter((l): l is [string, string] => !!l[1] && /^https:\/\//.test(l[1]))

  // Un botón por ilustración distinta (varias ediciones pueden compartirla).
  const arts: Card[] = []
  const seen = new Set<string>()
  for (const p of prints.data?.data ?? []) {
    const k = artKey(p)
    if (cardImage(p, 'small') && !seen.has(k)) {
      seen.add(k)
      arts.push(p)
    }
  }
  const total = prints.data ? prints.data.total_cards ?? prints.data.data.length : 0

  return (
    <div className="detail">
      <div>
        {src && <img className="main" src={src} alt={card.name} />}
        <p className="caption">{artCaption(shown)}</p>
        {arts.length > 1 && (
          <div className="arts">
            {arts.map((p) => (
              <button
                key={artKey(p)}
                type="button"
                className={artKey(p) === artKey(shown) ? 'on' : undefined}
                title={artCaption(p)}
                data-zoom
                onClick={() => pick(p)}
              >
                <img loading="lazy" src={cardImage(p, 'small')!} alt={'Arte de ' + p.set_name} />
              </button>
            ))}
          </div>
        )}
        {onPick && (
          <p className="hint">{picked ? `Guardado en el mazo: ${picked}.` : 'Elige un arte o una edición para usarlo en este mazo.'}</p>
        )}
      </div>

      <div>
        <h2 id="card-detail-name">{card.name}</h2>
        <p className="type">{[card.type_line, card.set_name, card.rarity].filter(Boolean).join(' · ')}</p>
        {text && <p className="oracle">{text}</p>}

        {rows.length ? (
          <table className="prices-table">
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="type">No hay precios disponibles para esta carta.</p>
        )}

        <div className="links">
          {links.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener">
              {label}
            </a>
          ))}
        </div>

        <div className="editions">
          <h3>Precios por edición</h3>
          {prints.isPending && <p className="type">Cargando ediciones…</p>}
          {prints.isError && <p className="type">No se han podido cargar las ediciones.</p>}
          {prints.data && (
            <>
              <p className="type">
                {total === 1 ? '1 edición' : `${num(total)} ediciones`}
                {prints.data.has_more ? ` (se muestran las ${prints.data.data.length} más recientes)` : ''}
              </p>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Edición</th>
                      <th>€</th>
                      <th>$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prints.data.data.map((p) => (
                      <tr key={p.id} className="pick" title="Ver esta edición" onClick={() => pick(p)}>
                        <td>
                          {p.set_name}{' '}
                          <small>{[(p.released_at ?? '').slice(0, 4), '#' + p.collector_number].filter(Boolean).join(' · ')}</small>
                        </td>
                        <PriceCell value={eur(p.prices.eur)} foil={eur(p.prices.eur_foil)} />
                        <PriceCell value={usd(p.prices.usd)} foil={usd(p.prices.usd_foil)} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="close-row">
          <button type="button" className="plain" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

function PriceCell({ value, foil }: { value: string | null; foil: string | null }) {
  if (value) return <td>{value}</td>
  if (foil)
    return (
      <td>
        {foil} <small>foil</small>
      </td>
    )
  return <td>—</td>
}

function artCaption(p: Card): string {
  return [p.set_name, p.artist ? 'Ilustración de ' + p.artist : ''].filter(Boolean).join(' · ')
}
