import { NavLink, Outlet, Link } from 'react-router'
import { CardZoom } from '../components/CardZoom'
import { AccountArea } from '../auth/AccountArea'
import { AuthDialog } from '../auth/AuthDialog'
import { Toast } from '../components/Toast'
import { useAuth, useIsAdmin } from '../auth/useAuth'
import './Layout.css'

export function Layout() {
  const loggedIn = useAuth((s) => !!s.user)
  const admin = useIsAdmin()

  const secciones = [
    { to: '/', label: 'Inicio', end: true },
    { to: '/cartas', label: 'Cartas' },
    { to: '/mazos', label: 'Mazos' },
    ...(loggedIn ? [{ to: '/jugar', label: 'Jugar' }] : []),
    ...(admin ? [{ to: '/admin', label: 'Admin' }] : []),
  ]

  return (
    <>
      <header className="site-header">
        <div className="bar">
          <Link className="brand" to="/">
            Cartas <span>Magic</span>
          </Link>
          <nav className="site-nav" aria-label="Secciones">
            {secciones.map((s) => (
              <NavLink key={s.to} to={s.to} end={s.end}>
                {s.label}
              </NavLink>
            ))}
          </nav>
          <AccountArea />
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="site-footer">
        Datos, imágenes y precios servidos por{' '}
        <a href="https://scryfall.com" target="_blank" rel="noopener">
          Scryfall
        </a>{' '}
        (precios orientativos de Cardmarket en € y TCGplayer en $, actualizados a diario). Página no oficial de fans: Magic: The
        Gathering es propiedad de Wizards of the Coast, que no la respalda ni patrocina.
      </footer>

      <CardZoom />
      <AuthDialog />
      <Toast />
    </>
  )
}
