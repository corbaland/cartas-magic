import { create } from 'zustand'

/** Avisos flotantes breves («Código copiado», errores…). Se muestran con <Toast />. */
interface ToastState {
  text: string
  bad: boolean
}

export const useToast = create<ToastState>(() => ({ text: '', bad: false }))

let timer: ReturnType<typeof setTimeout> | undefined

export function toast(text: string, bad = false) {
  useToast.setState({ text, bad })
  clearTimeout(timer)
  timer = setTimeout(() => useToast.setState({ text: '' }), 3500)
}
