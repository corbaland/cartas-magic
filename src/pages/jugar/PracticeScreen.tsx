import { Navigate } from 'react-router'
import { useGame } from '../../features/game/store'
import { Table } from './table/Table'

/** Mesa de práctica en solitario: solo existe mientras dura (no se guarda). */
export function PracticeScreen() {
  const practice = useGame((s) => s.practice)
  if (!practice) return <Navigate to="/jugar" replace />
  return <Table />
}
