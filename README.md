# Cartas Magic

Web de fans de Magic: The Gathering: buscador de cartas con precios, mazos de Commander y partidas en tiempo real.

Hecha con React, TypeScript y Vite. Datos de cartas de [Scryfall](https://scryfall.com); cuentas, mazos y partidas en Supabase.

## Trabajar en local

Necesitas Node.js (versión LTS).

```bash
npm install      # la primera vez
npm run dev      # servidor de desarrollo en http://localhost:5173
npm run build    # comprueba los tipos y genera la web en dist/
npm run lint     # revisa el código
```

## Organización

```
src/
  api/          acceso a Scryfall (y más adelante a Supabase)
  app/          rutas y estructura común (cabecera, pie)
  components/   piezas reutilizables (ficha de carta, carta ampliada…)
  lib/          utilidades (formato de precios, esperas…)
  pages/        una carpeta por sección: inicio, cartas…
  styles/       colores y estilos comunes
legacy/         la web anterior, mientras se termina de pasar a React
```
