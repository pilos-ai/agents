import { useCallback, useRef } from 'react'

interface ResizablePanelProps {
  width: number
  onResize: (width: number) => void
  minWidth: number
  maxWidth: number
  side: 'left' | 'right'
}

export function ResizablePanel({ width, onResize, minWidth, maxWidth, side }: ResizablePanelProps) {
  const startX = useRef(0)
  const startWidth = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startX.current = e.clientX
      startWidth.current = width

      const handleMouseMove = (e: MouseEvent) => {
        const diff = e.clientX - startX.current
        const newWidth = side === 'left'
          ? startWidth.current + diff
          : startWidth.current - diff
        onResize(Math.min(maxWidth, Math.max(minWidth, newWidth)))
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [width, onResize, minWidth, maxWidth, side]
  )

  return (
    <div
      onMouseDown={handleMouseDown}
      className="resize-handle w-1 flex-shrink-0 bg-neutral-800 hover:bg-blue-500 transition-colors"
    />
  )
}
