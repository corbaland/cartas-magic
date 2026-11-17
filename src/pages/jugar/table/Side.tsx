import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { game, useGame } from '../../../features/game/store'
import type { LogEntry } from '../../../features/game/types'
import { safeImg } from '../../../features/game/util'

/** Registro de la partida y chat (se puede ocultar). */
export function Side() {
  const room = useGame((s) => s.room)
  const save = useGame((s) => s.save)
  const log = useGame((s) => s.log)
  const hidden = useGame((s) => s.sideHidden)
  const listRef = useRef<HTMLOListElement>(null)
  const atEnd = useRef(true)
  const [text, setText] = useState('')

  // Baja al final con cada mensaje nuevo, salvo si se está leyendo más arriba.
  useLayoutEffect(() => {
    const list = listRef.current
    if (list && atEnd.current) list.scrollTop = list.scrollHeight
  }, [log, hidden])

  function send(ev: FormEvent) {
    ev.preventDefault()
    const t = text.trim()
    if (!t) return
    setText('')
    game.chat(t)
  }

  return (
    <aside className="gside">
      <div className="gside-head">
        <strong>{room?.name}</strong>
        <span className={'gsave' + (save.bad ? ' bad' : '')} role="status">
          {save.text}
        </span>
        <button type="button" className="gside-x" title="Ocultar el registro y el chat" aria-label="Ocultar el registro y el chat" onClick={game.toggleSide}>
          ✕
        </button>
      </div>
      <ol
        className="glog"
        ref={listRef}
        aria-live="polite"
        onScroll={(e) => {
          const l = e.currentTarget
          atEnd.current = l.scrollHeight - l.scrollTop - l.clientHeight < 60
        }}
      >
        {log.map((e) => (
          <LogLine key={e.id} e={e} />
        ))}
      </ol>
      <form className="gchat" onSubmit={send}>
        <input className="pinput" type="text" maxLength={300} placeholder="Escribe un mensaje…" aria-label="Mensaje para la mesa" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="plain small">
          Enviar
        </button>
      </form>
    </aside>
  )
}

function LogLine({ e }: { e: LogEntry }) {
  const cards = (e.data?.cards ?? []).slice(0, 20).filter((c) => safeImg(c?.img))
  return (
    <li className={'glog-' + (e.kind || 'action')}>
      {e.kind === 'system' ? (
        e.text
      ) : (
        <>
          <strong>{e.username || '?'}</strong>
          {e.kind === 'chat' ? ': ' + e.text : ' ' + e.text}
        </>
      )}
      {cards.length > 0 && (
        <div className="glog-cards">
          {cards.map((c, i) => (
            <img key={i} src={safeImg(c.img)!} alt={c.name || ''} title={c.name || ''} loading="lazy" data-zoom />
          ))}
        </div>
      )}
    </li>
  )
}
