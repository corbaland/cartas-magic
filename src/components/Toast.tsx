import { useToast } from '../lib/toast'
import './Toast.css'

export function Toast() {
  const { text, bad } = useToast()
  return (
    <div className={'toast' + (text ? ' on' : '') + (bad ? ' bad' : '')} role="status">
      {text}
    </div>
  )
}
