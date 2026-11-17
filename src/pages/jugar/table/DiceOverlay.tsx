import { useEffect, useState } from 'react'
import { game, useGame } from '../../../features/game/store'
import { randInt } from '../../../features/game/util'

const ROLL_MS = 900 // tiempo «rodando» antes de enseñar el resultado
const SHOW_MS = 3200 // tiempo que se queda en pantalla

/** Tirada de dado o moneda en grande, para todos los de la mesa. */
export function DiceOverlay() {
  const dice = useGame((s) => s.dice)
  if (!dice) return null
  return <Roll key={dice.id} who={dice.who} sides={dice.sides} value={dice.value} />
}

function face(sides: number, v: number): string {
  if (sides === 2) return v === 1 ? 'Cara' : 'Cruz'
  return String(v)
}

function Roll({ who, sides, value }: { who: string; sides: number; value: number }) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(() => (still ? value : randInt(sides) + 1))
  const [done, setDone] = useState(still)

  useEffect(() => {
    if (still) return
    // Va cambiando de número mientras «rueda» y después se queda en el resultado.
    const spin = setInterval(() => setShown(randInt(sides) + 1), 70)
    const stop = setTimeout(() => {
      clearInterval(spin)
      setShown(value)
      setDone(true)
    }, ROLL_MS)
    return () => {
      clearInterval(spin)
      clearTimeout(stop)
    }
  }, [sides, value, still])

  useEffect(() => {
    const t = setTimeout(game.closeDice, (still ? 0 : ROLL_MS) + SHOW_MS)
    return () => clearTimeout(t)
  }, [still])

  const label = sides === 2 ? 'Moneda' : `Dado de ${sides}`
  return (
    <div className="gdice" role="status" aria-live="polite" onClick={game.closeDice} title="Pulsa para cerrar">
      <div className={`gdice-box ${sides === 2 ? 'coin' : sides === 20 ? 'd20' : 'd6'}${done ? ' done' : ' rolling'}`}>
        <span>{face(sides, shown)}</span>
      </div>
      <p className="gdice-text">
        {done ? (
          <>
            <strong>{who}</strong> · {label}: <strong>{face(sides, value)}</strong>
          </>
        ) : (
          <>
            <strong>{who}</strong> lanza {sides === 2 ? 'una moneda' : `un d${sides}`}…
          </>
        )}
      </p>
    </div>
  )
}
