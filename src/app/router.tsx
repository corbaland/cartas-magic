import { createHashRouter, redirect } from 'react-router'
import { Layout } from './Layout'
import { InicioPage } from '../pages/inicio/InicioPage'
import { CartasPage } from '../pages/cartas/CartasPage'
import { PendientePage } from '../pages/PendientePage'

// Los enlaces de la web antigua (#cartas, #mazos…) siguen funcionando.
const viejo = /^#(inicio|cartas|mazos|jugar|admin)$/.exec(window.location.hash)
if (viejo) {
  const ruta = viejo[1] === 'inicio' ? '/' : '/' + viejo[1]
  window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + ruta)
}

// Rutas con «#» (…/cartas-magic/#/cartas): funcionan en GitHub Pages sin servidor propio.
export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <InicioPage /> },
      { path: 'cartas', element: <CartasPage /> },
      { path: 'mazos', element: <PendientePage seccion="Mazos" ancla="mazos" /> },
      { path: 'jugar', element: <PendientePage seccion="Jugar" ancla="jugar" /> },
      { path: 'admin', element: <PendientePage seccion="Admin" ancla="admin" /> },
      { path: '*', loader: () => redirect('/') },
    ],
  },
])
