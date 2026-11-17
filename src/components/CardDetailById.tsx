import { useQuery } from '@tanstack/react-query'
import { fetchCard } from '../api/scryfall'
import { CardDetail } from './CardDetail'

/** Ficha de una carta a partir de su id de Scryfall. */
export function CardDetailById({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['card', id],
    queryFn: ({ signal }) => fetchCard(id!, signal),
    enabled: !!id,
  })
  return <CardDetail card={id && q.data ? q.data : null} onClose={onClose} />
}
