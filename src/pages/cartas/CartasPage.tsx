import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { errorMessage, fetchCardPage, searchUrl, type Card, type SortKey } from '../../api/scryfall'
import { CardDetail } from '../../components/CardDetail'
import { useDebounced } from '../../lib/useDebounced'
import { num } from '../../lib/format'
import { SearchBox } from './SearchBox'
import { CardTile } from './CardTile'
import './CartasPage.css'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'name:asc', label: 'Nombre (A–Z)' },
  { value: 'eur:desc', label: 'Precio: de mayor a menor' },
  { value: 'eur:asc', label: 'Precio: de menor a mayor' },
  { value: 'released:desc', label: 'Más recientes' },
]

function isSort(v: string | null): v is SortKey {
  return SORTS.some((s) => s.value === v)
}

/**
 * Buscador de cartas. La búsqueda va en la dirección (…#/cartas?q=bolt&orden=eur:desc),
 * así se puede compartir o volver a ella con «atrás».
 */
export function CartasPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const exact = params.get('exacto') === '1'
  const ordenParam = params.get('orden')
  const sort: SortKey = isSort(ordenParam) ? ordenParam : 'name:asc'

  const [text, setText] = useState(q)
  const [detail, setDetail] = useState<Card | null>(null)

  // Lo escrito pasa a la búsqueda tras una pausa al teclear.
  const typed = useDebounced(text, 350)

  // Si la búsqueda cambia por otra vía (botón «atrás», enlace), el cuadro la refleja.
  const [seenQ, setSeenQ] = useState(q)
  if (q !== seenQ) {
    setSeenQ(q)
    if (q.trim() !== typed.trim()) setText(q)
  }

  useEffect(() => {
    if (typed.trim() === q.trim()) return
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (typed.trim()) next.set('q', typed.trim())
        else next.delete('q')
        next.delete('exacto')
        return next
      },
      { replace: true },
    )
  }, [typed]) // oxlint-disable-line react-hooks/exhaustive-deps

  function choose(name: string) {
    setText(name)
    setParams((p) => {
      const next = new URLSearchParams(p)
      next.set('q', name)
      next.set('exacto', '1')
      return next
    })
  }

  function changeSort(value: SortKey) {
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (value === 'name:asc') next.delete('orden')
        else next.set('orden', value)
        return next
      },
      { replace: true },
    )
  }

  const search = useInfiniteQuery({
    queryKey: ['cards', q.trim(), sort, exact],
    queryFn: ({ pageParam, signal }) => fetchCardPage(pageParam, signal),
    initialPageParam: searchUrl(q, sort, exact),
    getNextPageParam: (last) => (last.has_more ? last.next_page : undefined),
  })

  const cards = search.data?.pages.flatMap((p) => p.data) ?? []
  const total = search.data?.pages[0]?.total_cards ?? 0

  // Carga la página siguiente al acercarse al final.
  const moreRef = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = search
  useEffect(() => {
    const node = moreRef.current
    if (!node) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  let status = ''
  if (search.isPending) status = 'Cargando…'
  else if (search.isError) status = errorMessage(search.error)
  else if (!cards.length) status = 'No se ha encontrado ninguna carta con ese nombre. Prueba con el nombre en inglés.'
  else status = `Mostrando ${num(cards.length)} de ${num(total || cards.length)} cartas`

  return (
    <>
      <div className="tools">
        <div className="bar">
          <SearchBox value={text} onChange={setText} onChoose={choose} />
          <select aria-label="Ordenar por" value={sort} onChange={(ev) => changeSort(ev.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="page">
        <p className="status" role="status" aria-live="polite">
          {status}
        </p>
        <div className="card-grid">
          {cards.map((c) => (
            <CardTile key={c.id} card={c} onOpen={setDetail} />
          ))}
        </div>
        <div className="more" ref={moreRef}>
          {hasNextPage && (
            <button type="button" className="plain" disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
              {isFetchingNextPage ? 'Cargando…' : 'Cargar más cartas'}
            </button>
          )}
        </div>
      </div>

      <CardDetail card={detail} onClose={() => setDetail(null)} />
    </>
  )
}
