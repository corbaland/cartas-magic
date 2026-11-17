import type { CSSProperties } from 'react'
import './InicioPage.css'

const SYMBOLS = 'https://svgs.scryfall.io/card-symbols/'

// Los cinco colores de maná, con el brillo de cada uno.
const MANA = [
  { s: 'W', glow: 'rgba(248,241,201,.55)' },
  { s: 'U', glow: 'rgba(74,163,224,.6)' },
  { s: 'B', glow: 'rgba(154,134,184,.6)' },
  { s: 'R', glow: 'rgba(232,85,62,.6)' },
  { s: 'G', glow: 'rgba(63,174,106,.6)' },
]

// Símbolos de fondo: tamaño, retraso de la animación y posición.
const FONDO: { s: string; style: CSSProperties }[] = [
  { s: 'T', style: { '--s': '120px', '--d': '-1s', left: '6%', top: '14%' } as CSSProperties },
  { s: 'C', style: { '--s': '90px', '--d': '-4s', right: '9%', top: '20%' } as CSSProperties },
  { s: 'S', style: { '--s': '70px', '--d': '-2s', left: '20%', bottom: '12%' } as CSSProperties },
  { s: 'E', style: { '--s': '110px', '--d': '-6s', right: '16%', bottom: '10%' } as CSSProperties },
  { s: 'X', style: { '--s': '56px', '--d': '-3s', left: '38%', top: '8%' } as CSSProperties },
  { s: 'Q', style: { '--s': '64px', '--d': '-7s', right: '36%', bottom: '6%' } as CSSProperties },
]

// Si un símbolo no carga, se quita en vez de dejar el icono roto.
function quitar(ev: React.SyntheticEvent<HTMLImageElement>) {
  ev.currentTarget.remove()
}

export function InicioPage() {
  return (
    <section className="hero">
      <div className="hero-bg" aria-hidden="true">
        {FONDO.map((f) => (
          <img key={f.s} src={`${SYMBOLS}${f.s}.svg`} alt="" style={f.style} onError={quitar} />
        ))}
      </div>
      <div className="mana" aria-hidden="true">
        {MANA.map((m, i) => (
          <img
            key={m.s}
            src={`${SYMBOLS}${m.s}.svg`}
            alt=""
            style={{ '--i': i, '--glow': m.glow } as CSSProperties}
            onError={quitar}
          />
        ))}
      </div>
      <h1>Bienvenidos a la Magia</h1>
      <div className="orn" aria-hidden="true">◆</div>
    </section>
  )
}
