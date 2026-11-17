import { useEffect, useRef, useState } from 'react'
import { useDecks } from '../../features/decks/useDecks'
import { importList, parseList } from '../../features/decks/importList'
import type { Deck } from '../../features/decks/rules'

/** Ventana para pegar una lista de Moxfield, Archidekt, EDHPlay… */
export function ImportDialog({ deck, open, onClose }: { deck: Deck; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    if (!open && dlg.open) dlg.close()
  }, [open])

  return (
    <dialog ref={ref} className="import-dialog" aria-labelledby="import-title" onClose={onClose}>
      {/* El contenido se crea al abrir, así cada vez empieza vacío. */}
      {open && <ImportBody deck={deck} onClose={onClose} />}
    </dialog>
  )
}

function ImportBody({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const apply = useDecks((s) => s.apply)
  const [text, setText] = useState('')
  const [clear, setClear] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' })
  const [busy, setBusy] = useState(false)

  async function run() {
    const entries = parseList(text)
    if (!entries.length) return setMsg({ text: 'No he encontrado ninguna carta en el texto.', bad: true })
    setBusy(true)
    setMsg({ text: `Buscando ${entries.length} cartas…` })
    try {
      apply(await importList(deck, entries, clear))
      onClose()
    } catch (err) {
      console.error(err)
      setMsg({ text: 'No se han podido buscar las cartas. Inténtalo de nuevo.', bad: true })
      setBusy(false)
    }
  }

  return (
    <div className="import">
      <h2 id="import-title">Importar cartas</h2>
      <p className="note">
        Pega la lista del mazo, una carta por línea, tal como la copian Moxfield, Archidekt o EDHPlay. Sirven formatos como «1 Sol Ring»,
        «1x Sol Ring» o «1 Sol Ring (C21) 263».
      </p>
      <textarea
        rows={12}
        spellCheck={false}
        autoFocus
        aria-label="Lista de cartas"
        placeholder={"1 Atraxa, Praetors' Voice\n1 Sol Ring\n1 Cultivate\n8 Forest"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label className="check">
        <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} /> Vaciar el mazo antes de importar
      </label>
      <p className={'import-msg' + (msg.bad ? ' bad' : '')} role="status" aria-live="polite">
        {msg.text}
      </p>
      <div className="close-row">
        <button type="button" className="plain" onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="plain primary" disabled={busy} onClick={run}>
          Importar
        </button>
      </div>
    </div>
  )
}
