import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la web se sirve en https://corbaland.github.io/cartas-magic/
  base: './',
  server: { port: 5173, strictPort: true },
})
