import { useDecks } from '../../features/decks/useDecks'
import { countCards } from '../../features/decks/rules'

/** Desplegable con mis mazos. */
export function DeckSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const decks = useDecks((s) => s.decks)
  return (
    <select className="pinput" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{decks.length ? 'Elige un mazo…' : 'No tienes mazos'}</option>
      {decks.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name || 'Mazo sin nombre'} ({countCards(d)} cartas)
        </option>
      ))}
    </select>
  )
}
