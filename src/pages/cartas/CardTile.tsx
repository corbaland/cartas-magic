import { memo } from 'react'
import { cardImage, type Card } from '../../api/scryfall'
import { eur, usd } from '../../lib/format'

/** Una carta en la cuadrícula de resultados. */
export const CardTile = memo(function CardTile({ card, onOpen }: { card: Card; onOpen: (c: Card) => void }) {
  const src = cardImage(card, 'normal')
  const e = eur(card.prices.eur ?? card.prices.eur_foil)
  const u = usd(card.prices.usd ?? card.prices.usd_foil)
  return (
    <button type="button" className="card" onClick={() => onOpen(card)}>
      {src ? <img loading="lazy" src={src} alt="" data-zoom /> : <div className="noimg">Sin imagen</div>}
      <div className="name">{card.name}</div>
      <div className="set">{card.set_name}</div>
      <div className="prices">
        {e && <b>{e}</b>}
        {u && <span>{u}</span>}
        {!e && !u && <span className="none">Sin precio</span>}
      </div>
    </button>
  )
})
