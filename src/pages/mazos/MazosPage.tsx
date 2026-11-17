import { useAuth } from '../../auth/useAuth'
import { oldDeckCount, useDecks } from '../../features/decks/useDecks'
import { LIMIT, countCards } from '../../features/decks/rules'
import { DeckEditor } from './DeckEditor'
import './mazos.css'

export function MazosPage() {
  const { ready, user, openLogin } = useAuth()

  if (!user) {
    const local = ready ? oldDeckCount() : 0
    return (
      <div className="page">
        <div className="deck-empty deck-gate">
          {ready ? (
            <>
              <p>
                Para crear y guardar mazos necesitas una cuenta.
                {local > 0 &&
                  ` Tienes ${local === 1 ? '1 mazo' : `${local} mazos`} de antes en este navegador: se pasarán a tu cuenta al entrar.`}
              </p>
              <div className="gate-btns">
                <button type="button" className="plain primary" onClick={() => openLogin('login')}>
                  Entrar
                </button>
                <button type="button" className="plain" onClick={() => openLogin('signup')}>
                  Crear cuenta
                </button>
              </div>
            </>
          ) : (
            <p>Cargando…</p>
          )}
        </div>
      </div>
    )
  }

  return <DecksArea />
}

function DecksArea() {
  const { decks, currentId, loaded, note, select, create } = useDecks()
  const deck = decks.find((d) => d.id === currentId) ?? null

  return (
    <div className="page decks">
      <aside className="deck-side">
        <div className="side-head">
          <h2>Mis mazos</h2>
          <button type="button" className="plain" onClick={create} disabled={!loaded}>
            + Nuevo mazo
          </button>
        </div>
        <ul className="deck-list">
          {decks.map((d) => (
            <li key={d.id}>
              <button type="button" className={d.id === currentId ? 'on' : undefined} onClick={() => select(d.id)}>
                <span>{d.name || 'Mazo sin nombre'}</span>
                <small>
                  {countCards(d)}/{LIMIT}
                </small>
              </button>
            </li>
          ))}
        </ul>
        <p className="note">Formato Commander.</p>
        <p className={'note' + (note.bad ? ' bad' : '')} role="status" aria-live="polite">
          {note.text}
        </p>
      </aside>

      <div>
        {deck ? (
          <DeckEditor key={deck.id} deck={deck} />
        ) : loaded ? (
          <div className="deck-empty">
            <p>Aún no tienes ningún mazo.</p>
            <button type="button" className="plain" onClick={create}>
              Crear mi primer mazo
            </button>
          </div>
        ) : (
          <div className="deck-empty">
            <p>Cargando tus mazos…</p>
          </div>
        )}
      </div>
    </div>
  )
}
