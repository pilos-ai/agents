import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { useAppStore } from '../../store/useAppStore'
import { api } from '../../api'

interface Props {
  id: string
  cwd?: string
}

export function TerminalTab({ id, cwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const fontSize = useAppStore((s) => s.terminalFontSize)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontSize,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        // Match the host (.xterm-host / .term-wrap = #07070b) so written cells,
        // empty rows, and the surrounding gutter are always the same shade —
        // no seam between rendered and un-rendered terminal area.
        background: '#07070b',
        foreground: '#e5e5e5',
        cursor: '#3b82f6',
        selectionBackground: '#374151',
      },
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())

    term.open(containerRef.current)

    // Fit after a brief delay for layout
    requestAnimationFrame(() => {
      fitAddon.fit()
    })

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    // Create PTY on backend
    const { cols, rows } = term
    api.terminal.create(id, { cols, rows, cwd })

    // Terminal input -> PTY
    term.onData((data: string) => {
      api.terminal.write(id, data)
    })

    // PTY output -> Terminal
    const unsubData = api.terminal.onData((termId: string, data: string) => {
      if (termId === id) {
        term.write(data)
      }
    })

    // Terminal resize -> PTY
    term.onResize(({ cols, rows }) => {
      api.terminal.resize(id, cols, rows)
    })

    // Window resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit()
      })
    })
    resizeObserver.observe(containerRef.current)

    // Right-click → custom context menu (spell-check + copy/paste). Mirrors the
    // listener the v4.1.x TerminalPage had before the v2 rewrite stripped it.
    const host = containerRef.current
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const selection = term.getSelection() || ''
      window.api.shell?.showContextMenu?.(selection, false)
    }
    host.addEventListener('contextmenu', onContextMenu)

    return () => {
      host.removeEventListener('contextmenu', onContextMenu)
      unsubData()
      resizeObserver.disconnect()
      term.dispose()
      // Reap the PTY on the electron side — otherwise closing a tab (or
      // remounting on project switch) leaks the shell process. v2 rewrite
      // dropped this call.
      api.terminal.destroy(id).catch(() => {})
    }
  }, [id, fontSize])

  return <div ref={containerRef} className="h-full w-full" />
}
