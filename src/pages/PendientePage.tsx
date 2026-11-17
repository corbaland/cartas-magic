// Sección que todavía no se ha pasado a la nueva versión: se usa en la web actual.
const WEB_ACTUAL = 'https://corbaland.github.io/cartas-magic/'

export function PendientePage({ seccion, ancla }: { seccion: string; ancla: string }) {
  return (
    <div className="page">
      <h1>{seccion}</h1>
      <p>Esta sección todavía se está pasando a la nueva versión de la web.</p>
      <p>
        Mientras tanto, puedes usarla en la web actual:{' '}
        <a href={`${WEB_ACTUAL}#${ancla}`} style={{ color: 'var(--accent)' }}>
          abrir {seccion}
        </a>
        .
      </p>
    </div>
  )
}
