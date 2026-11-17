import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { autocomplete, namedImageUrl } from '../../api/scryfall'
import { useDebounced } from '../../lib/useDebounced'
import './SearchBox.css'

interface Props {
  value: string
  onChange: (text: string) => void
  /** Se ha elegido una sugerencia: buscar ese nombre exacto. */
  onChoose: (name: string) => void
}

const MAX = 20

/** Buscador con sugerencias de nombres (ratón, rueda y flechas del teclado). */
export function SearchBox({ value, onChange, onChoose }: Props) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [preview, setPreview] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const text = useDebounced(value.trim(), 150)
  const sug = useQuery({
    queryKey: ['autocomplete', text.toLowerCase()],
    queryFn: ({ signal }) => autocomplete(text, signal),
    enabled: open && text.length >= 2,
  })

  // Primero los nombres que empiezan por lo escrito y después los que lo contienen.
  const low = text.toLowerCase()
  const names = (sug.data ?? []).slice()
  names.sort((a, b) => Number(!a.toLowerCase().startsWith(low)) - Number(!b.toLowerCase().startsWith(low)))
  const list = names.slice(0, MAX)
  const visible = open && text.length >= 2 && list.length > 0

  // Al llegar sugerencias nuevas, ninguna marcada y la lista vuelve arriba.
  const [seenData, setSeenData] = useState(sug.data)
  if (sug.data !== seenData) {
    setSeenData(sug.data)
    setActive(-1)
  }
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0
  }, [sug.data])

  // Vista previa con un pequeño retardo para no pedir una imagen por cada roce.
  const target = visible ? list[active >= 0 ? active : 0] : null
  useEffect(() => {
    if (!target || !window.matchMedia('(min-width: 720px)').matches) return
    const t = setTimeout(() => setPreview(target), 180)
    return () => clearTimeout(t)
  }, [target])

  function choose(name: string) {
    setOpen(false)
    onChoose(name)
  }

  function mark(i: number, scroll: boolean) {
    if (!list.length) return
    const next = (i + list.length) % list.length
    setActive(next)
    if (scroll) listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="search">
      <input
        type="search"
        value={value}
        placeholder="Busca por nombre (en inglés), p. ej. Lightning Bolt"
        autoComplete="off"
        aria-label="Buscar carta por nombre"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={visible}
        onChange={(ev) => {
          onChange(ev.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(ev) => {
          if (ev.key === 'Escape') return setOpen(false)
          if (!visible) return
          if (ev.key === 'ArrowDown') {
            ev.preventDefault()
            mark(active + 1, true)
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault()
            mark(active < 0 ? -1 : active - 1, true)
          } else if (ev.key === 'Enter') {
            if (active >= 0) {
              ev.preventDefault()
              choose(list[active])
            } else setOpen(false)
          }
        }}
      />
      {visible && (
        // Pulsar o arrastrar la barra de la lista no debe quitar el foco del buscador.
        <div className="sug" onMouseDown={(ev) => ev.preventDefault()}>
          <ul id={listId} ref={listRef} className="sug-list" role="listbox" aria-label="Sugerencias">
            {list.map((name, i) => (
              <li
                key={name}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'on' : undefined}
                onMouseMove={() => i !== active && mark(i, false)}
                onClick={() => choose(name)}
              >
                <span className="txt">
                  <Highlight name={name} part={text} />
                </span>
                <span className="go">Buscar ↵</span>
              </li>
            ))}
          </ul>
          <div className="sug-preview" aria-hidden="true">
            {preview && list.includes(preview) && <PreviewImage key={preview} name={preview} />}
          </div>
          <div className="sug-foot">
            <span>{list.length === 1 ? '1 sugerencia' : `${list.length} sugerencias`}</span>
            <span>{list.length > 8 ? 'Desplázate para ver más' : '↑ ↓ para moverte'}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Resalta la parte del nombre que coincide con lo escrito. */
function Highlight({ name, part }: { name: string; part: string }) {
  const at = name.toLowerCase().indexOf(part.toLowerCase())
  if (at < 0 || !part) return <>{name}</>
  return (
    <>
      {name.slice(0, at)}
      <b>{name.slice(at, at + part.length)}</b>
      {name.slice(at + part.length)}
    </>
  )
}

function PreviewImage({ name }: { name: string }) {
  const [ready, setReady] = useState(false)
  return <img src={namedImageUrl(name)} alt="" className={ready ? 'ready' : undefined} onLoad={() => setReady(true)} />
}
