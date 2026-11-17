import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Rutas relativas: la web se sirve en https://corbaland.github.io/cartas-magic/
  base: './',
  server: { port: 5173, strictPort: true },
  // La base (React + cliente de Supabase) ronda los 580 kB sin comprimir (~170 kB comprimida).
  build: { chunkSizeWarningLimit: 650 },
})
