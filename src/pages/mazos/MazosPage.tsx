import { useEffect } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/useAuth'
import { oldDeckCount, useDecks } from '../../features/decks/useDecks'
import { LIMIT, countCards, type Deck } from '../../features/decks/rules'
import { DeckEditor } from './DeckEditor'
import './mazos.css'

/** Mazos: primero el menú con todos los mazos; …/#/mazos/:id abre el editor de uno. */
export function MazosPage() {
  const { ready, user, openLogin } = useAuth()
  const { id } = useParams()

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

  return id ? <DecksArea id={id} /> : <DeckGallery />
}

/** Menú de mazos: la carta del comandante, el nombre y cuántas cartas lleva cada uno. */
function DeckGallery() {
  const { decks, loaded, note, create } = useDecks()
  const navigate = useNavigate()

  function newDeck() {
    navigate(`/mazos/${create()}`)
  }

  return (
    <div className="page">
      <div className="gallery-head">
        <h1 className="admin-title">Mis mazos</h1>
        <button type="button" className="plain primary" onClick={newDeck} disabled={!loaded}>
          + Nuevo mazo
        </button>
      </div>
      <p className={'note' + (note.bad ? ' bad' : '')} role="status" aria-live="polite">
        {note.text}
      </p>
      {!loaded ? (
        <div className="deck-empty">
          <p>Cargando tus mazos…</p>
        </div>
      ) : !decks.length ? (
        <div className="deck-empty">
          <p>Aún no tienes ningún mazo.</p>
          <button type="button" className="plain" onClick={newDeck}>
            Crear mi primer mazo
          </button>
        </div>
      ) : (
        <ul className="deck-gallery">
          {decks.map((d) => (
            <li key={d.id}>
              <DeckBox deck={d} />
            </li>
          ))}
          <li>
            <button type="button" className="deck-box deck-new" onClick={newDeck}>
              <span className="deck-cover">
                <span>+</span>
              </span>
              <span className="deck-title">Nuevo mazo</span>
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

function DeckBox({ deck }: { deck: Deck }) {
  const cmd = deck.cards.find((c) => c.sec === 'comandante')
  const n = countCards(deck)
  return (
    <Link className="deck-box" to={`/mazos/${deck.id}`} title={`Abrir «${deck.name || 'Mazo sin nombre'}»`}>
      <span className="deck-cover">
        {cmd?.img ? (
          <img src={cmd.img.replace('/small/', '/normal/')} alt="" loading="lazy" data-zoom />
        ) : (
          <span className="deck-nocmd">Sin comandante</span>
        )}
      </span>
      <span className="deck-title">{deck.name || 'Mazo sin nombre'}</span>
      <span className={'deck-meta' + (n >= LIMIT ? ' full' : '')}>
        {n}/{LIMIT} cartas{cmd ? ` · ${cmd.name}` : ''}
      </span>
    </Link>
  )
}

function DecksArea({ id }: { id: string }) {
  const { decks, currentId, loaded, note, select, create } = useDecks()
  const navigate = useNavigate()
  const deck = decks.find((d) => d.id === id) ?? null

  // El mazo de la dirección es el que se edita.
  useEffect(() => {
    if (deck && currentId !== id) select(id)
  }, [deck, currentId, id, select])

  if (loaded && !deck) return <Navigate to="/mazos" replace />

  return (
    <div className="page decks">
      <aside className="deck-side">
        <Link className="back-link" to="/mazos">
          ← Todos los mazos
        </Link>
        <div className="side-head">
          <h2>Mis mazos</h2>
          <button type="button" className="plain" onClick={() => navigate(`/mazos/${create()}`)} disabled={!loaded}>
            + Nuevo
          </button>
        </div>
        <ul className="deck-list">
          {decks.map((d) => (
            <li key={d.id}>
              <button type="button" className={d.id === id ? 'on' : undefined} onClick={() => navigate(`/mazos/${d.id}`)}>
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
        {deck && currentId === id ? (
          <DeckEditor key={deck.id} deck={deck} onDeleted={() => navigate('/mazos')} />
        ) : (
          <div className="deck-empty">
            <p>Cargando el mazo…</p>
          </div>
        )}
      </div>
    </div>
  )
}
