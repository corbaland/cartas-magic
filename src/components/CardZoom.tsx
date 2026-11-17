import { useEffect, useRef } from 'react'
import './CardZoom.css'

/*
 * Carta ampliada al dejar el ratón encima de cualquier imagen con `data-zoom`
 * (o de un elemento con `data-zoom` que contenga una imagen).
 * - Normal: aparece al lado de la carta tras ZOOM_DELAY.
 * - Dentro de un elemento con `data-zoom-area` (la mesa de juego): casi al
 *   instante y en el lateral contrario de esa zona.
 * Va en una capa «popover» para quedar por encima de las ventanas abiertas.
 */
const ZOOM_DELAY = 1000
const ZOOM_FAST = 120

export function CardZoom() {
  const boxRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const box = boxRef.current
    const big = imgRef.current
    if (!box || !big) return
    const canHover = window.matchMedia('(hover: hover)')
    const usePopover = typeof box.showPopover === 'function'
    let timer: ReturnType<typeof setTimeout> | undefined
    let current: Element | null = null
    let open = false

    function hide() {
      clearTimeout(timer)
      current = null
      if (!open) return
      open = false
      if (usePopover) box!.hidePopover()
      else box!.style.display = 'none'
      big!.removeAttribute('src')
    }

    function show(target: Element) {
      const img = target instanceof HTMLImageElement ? target : target.querySelector('img')
      if (!img || !img.isConnected || !img.src) return
      const r = target.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      let h = Math.min(680, vh - 24)
      let w = Math.round((h * 488) / 680)
      let left: number
      let top: number
      const area = target.closest('[data-zoom-area]')
      if (area) {
        const a = area.getBoundingClientRect()
        h = Math.max(260, Math.min(560, a.height - 24, vh - 24))
        w = Math.round((h * 488) / 680)
        const onRight = r.left + r.width / 2 > a.left + a.width / 2
        left = onRight ? a.left + 12 : a.right - w - 12
        left = Math.max(8, Math.min(left, vw - w - 8))
        top = Math.max(12, Math.min(a.top + (a.height - h) / 2, vh - h - 12))
      } else {
        if (w < r.width * 1.25) return // ya se ve casi igual de grande
        const gap = 14
        if (r.right + gap + w <= vw - 8) left = r.right + gap
        else if (r.left - gap - w >= 8) left = r.left - gap - w
        else return
        top = Math.max(12, Math.min(r.top + r.height / 2 - h / 2, vh - h - 12))
      }
      Object.assign(box!.style, {
        left: left + 'px',
        top: top + 'px',
        width: w + 'px',
        height: h + 'px',
        backgroundImage: `url("${img.src}")`, // la pequeña hace de fondo mientras llega la grande
      })
      big!.src = img.src.replace(/\/(small|normal)\//, '/large/')
      if (usePopover) box!.showPopover()
      else box!.style.display = 'block'
      open = true
    }

    function onOver(ev: MouseEvent) {
      if (!canHover.matches) return
      const el = ev.target instanceof Element ? ev.target.closest('[data-zoom]') : null
      const target = document.body.classList.contains('dragging-card') ? null : el
      if (target === current) return
      hide()
      if (!target) return
      current = target
      const delay = target.closest('[data-zoom-area]') ? ZOOM_FAST : ZOOM_DELAY
      timer = setTimeout(() => {
        if (current === target) show(target)
      }, delay)
    }

    if (!usePopover) box.style.display = 'none'
    document.addEventListener('mouseover', onOver)
    document.documentElement.addEventListener('mouseleave', hide)
    document.addEventListener('mousedown', hide)
    document.addEventListener('keydown', hide)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('mouseover', onOver)
      document.documentElement.removeEventListener('mouseleave', hide)
      document.removeEventListener('mousedown', hide)
      document.removeEventListener('keydown', hide)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  return (
    <div ref={boxRef} className="card-zoom" popover="manual" aria-hidden="true">
      <img ref={imgRef} alt="" />
    </div>
  )
}
