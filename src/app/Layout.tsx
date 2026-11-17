import { NavLink, Outlet, Link } from 'react-router'
import { CardZoom } from '../components/CardZoom'
import './Layout.css'

const SECCIONES = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/cartas', label: 'Cartas' },
  { to: '/mazos', label: 'Mazos' },
]

export function Layout() {
  return (
    <>
      <header className="site-header">
        <div className="bar">
          <Link className="brand" to="/">
            Cartas <span>Magic</span>
          </Link>
          <nav className="site-nav" aria-label="Secciones">
            {SECCIONES.map((s) => (
              <NavLink key={s.to} to={s.to} end={s.end}>
                {s.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="site-footer">
        Datos, imágenes y precios servidos por{' '}
        <a href="https://scryfall.com" target="_blank" rel="noopener">Scryfall</a>{' '}
        (precios orientativos de Cardmarket en € y TCGplayer en $, actualizados a diario). Página no oficial de
        fans: Magic: The Gathering es propiedad de Wizards of the Coast, que no la respalda ni patrocina.
      </footer>

      <CardZoom />
    </>
  )
}
