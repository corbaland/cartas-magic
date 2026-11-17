import { createHashRouter, redirect } from 'react-router'
import { Layout } from './Layout'
import { InicioPage } from '../pages/inicio/InicioPage'

// Los enlaces de la web antigua (#cartas, #mazos…, #unirse=CODIGO) siguen funcionando.
const viejo = /^#(inicio|cartas|mazos|jugar|admin)$/.exec(window.location.hash)
const invitacion = /^#unirse=([A-Za-z0-9]{6})$/.exec(window.location.hash)
if (viejo || invitacion) {
  const ruta = invitacion ? `/jugar/unirse/${invitacion[1].toUpperCase()}` : viejo![1] === 'inicio' ? '/' : '/' + viejo![1]
  window.history.replaceState(null, '', window.location.pathname + window.location.search + '#' + ruta)
}

// Rutas con «#» (…/cartas-magic/#/cartas): funcionan en GitHub Pages sin servidor propio.
// Cada sección se descarga solo cuando se abre («lazy»).
export const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <InicioPage /> },
      { path: 'cartas', lazy: async () => ({ Component: (await import('../pages/cartas/CartasPage')).CartasPage }) },
      { path: 'mazos', lazy: async () => ({ Component: (await import('../pages/mazos/MazosPage')).MazosPage }) },
      {
        path: 'jugar',
        lazy: async () => ({ Component: (await import('../pages/jugar/JugarPage')).JugarPage }),
        children: [
          { index: true, lazy: async () => ({ Component: (await import('../pages/jugar/HomeScreen')).HomeScreen }) },
          { path: 'sala/:id', lazy: async () => ({ Component: (await import('../pages/jugar/RoomScreen')).RoomRoute }) },
          { path: 'practica', lazy: async () => ({ Component: (await import('../pages/jugar/PracticeScreen')).PracticeScreen }) },
          { path: 'unirse/:code', lazy: async () => ({ Component: (await import('../pages/jugar/JugarPage')).JoinRoute }) },
        ],
      },
      { path: 'admin', lazy: async () => ({ Component: (await import('../pages/admin/AdminPage')).AdminPage }) },
      { path: '*', loader: () => redirect('/') },
    ],
  },
])
