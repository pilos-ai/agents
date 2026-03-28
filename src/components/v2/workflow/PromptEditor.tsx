import { forwardRef, useImperativeHandle, useRef, useState, useEffect, useCallback } from 'react'
import { Icon } from '../../common/Icon'
import { InlineSuggestions } from './InlineSuggestions'
import { DataPicker } from './DataPicker'

// ── Chip helpers ──────────────────────────────────────────────────────────────

function createChip(ref: string): HTMLSpanElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.ref = ref
  chip.className =
    'inline-flex items-center rounded px-1.5 mx-[1px] text-[10px] font-mono font-medium ' +
    'leading-5 select-none align-middle ' +
    'bg-blue-500/10 text-blue-300 border border-blue-500/20'
  chip.textContent = ref
  return chip
}

// ── Serialization ─────────────────────────────────────────────────────────────

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement
    if (el.dataset.ref) return el.dataset.ref
    if (el.tagName === 'BR') return '\n'
    // contenteditable wraps new lines in <div> on some platforms
    if (el.tagName === 'DIV') {
      const inner = Array.from(el.childNodes).map(serializeNode).join('')
      return '\n' + inner
    }
    return Array.from(el.childNodes).map(serializeNode).join('')
  }
  return ''
}

function serializeEditor(el: HTMLElement): string {
  return Array.from(el.childNodes).map(serializeNode).join('')
}

// ── DOM initialisation from stored string ─────────────────────────────────────

function renderValueToDOM(el: HTMLElement, value: string) {
  el.innerHTML = ''
  if (!value) return
  const parts = value.split(/({{[^}]*}})/g)
  for (const part of parts) {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      el.appendChild(createChip(part))
    } else {
      const lines = part.split('\n')
      lines.forEach((line, i) => {
        if (i > 0) el.appendChild(document.createElement('br'))
        if (line) el.appendChild(document.createTextNode(line))
      })
    }
  }
}

// ── Public ref interface ──────────────────────────────────────────────────────

export interface PromptEditorHandle {
  insertRef: (ref: string) => void
  focus: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PromptEditorProps {
  defaultValue: string
  onChange: (value: string) => void
  placeholder?: string
  nodeId: string
  /** Renders a label row with hint + picker button above the editor */
  label?: string
  /** Smaller height for single-line-ish fields (e.g. parameters) */
  compact?: boolean
}

export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(
  ({ defaultValue, onChange, placeholder, nodeId, label, compact }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null)
    const [isEmpty, setIsEmpty] = useState(!defaultValue)
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
    const [query, setQuery] = useState('')
    // Saved selection range — persisted on blur so button clicks don't lose cursor
    const savedRangeRef = useRef<Range | null>(null)
    // Internal DataPicker (opened by the {} button)
    const pickerBtnRef = useRef<HTMLButtonElement>(null)
    const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null)
    const [caretRect, setCaretRect] = useState<DOMRect | null>(null)

    // Initialise DOM from stored value on mount only
    useEffect(() => {
      const el = editorRef.current
      if (!el) return
      renderValueToDOM(el, defaultValue)
      setIsEmpty(!defaultValue)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleBlur = useCallback(() => {
      const sel = window.getSelection()
      if (sel && sel.rangeCount) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange()
      }
    }, [])

    // Insert a template ref chip at the current cursor position
    const insertRef = useCallback(
      (templateRef: string) => {
        const el = editorRef.current
        if (!el) return

        // Check before focus() — after focus() browser may put caret at start/end
        const selBefore = window.getSelection()
        const wasOutside = !selBefore || !selBefore.rangeCount
          || !el.contains(selBefore.getRangeAt(0).commonAncestorContainer)

        el.focus()

        // Restore saved cursor if user was outside the editor (e.g. DataPickerButton click)
        if (wasOutside && savedRangeRef.current) {
          const sel = window.getSelection()
          if (sel) {
            sel.removeAllRanges()
            sel.addRange(savedRangeRef.current.cloneRange())
          }
        }

        // If we are in autocomplete mode, delete the typed `{{query` first
        const sel = window.getSelection()
        if (anchorEl && sel && sel.rangeCount) {
          const range = sel.getRangeAt(0)
          const container = range.endContainer
          if (container.nodeType === Node.TEXT_NODE) {
            const text = container.textContent || ''
            const cursorInNode = range.endOffset
            const beforeCursor = text.slice(0, cursorInNode)
            const lastOpen = beforeCursor.lastIndexOf('{{')
            if (lastOpen !== -1) {
              const del = document.createRange()
              del.setStart(container, lastOpen)
              del.setEnd(container, cursorInNode)
              del.deleteContents()
            }
          }
        }

        // Insert the chip at current (possibly updated) cursor
        const sel2 = window.getSelection()
        const chip = createChip(templateRef)
        if (sel2 && sel2.rangeCount) {
          const r = sel2.getRangeAt(0)
          r.insertNode(chip)
          const after = document.createRange()
          after.setStartAfter(chip)
          after.collapse(true)
          sel2.removeAllRanges()
          sel2.addRange(after)
        } else {
          el.appendChild(chip)
        }

        // Insert a trailing space so the user can keep typing after the chip
        document.execCommand('insertText', false, ' ')

        setAnchorEl(null)
        setQuery('')

        const serialized = serializeEditor(el)
        setIsEmpty(!serialized.trim())
        onChange(serialized)
      },
      [anchorEl, onChange],
    )

    useImperativeHandle(ref, () => ({ insertRef, focus: () => editorRef.current?.focus() }))

    const handleInput = useCallback(() => {
      const el = editorRef.current
      if (!el) return

      const serialized = serializeEditor(el)
      setIsEmpty(!serialized.trim())
      onChange(serialized)

      // Detect unclosed `{{` in the current text node before cursor
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) { setAnchorEl(null); setQuery(''); return }

      const range = sel.getRangeAt(0)
      const container = range.endContainer

      if (container.nodeType === Node.TEXT_NODE) {
        const beforeCursor = (container.textContent || '').slice(0, range.endOffset)
        const lastOpen = beforeCursor.lastIndexOf('{{')
        const lastClose = beforeCursor.lastIndexOf('}}')
        if (lastOpen !== -1 && lastOpen > lastClose) {
          // Capture caret pixel position for accurate suggestion placement
          const caretRange = range.cloneRange()
          caretRange.collapse(false)
          setCaretRect(caretRange.getBoundingClientRect())
          setAnchorEl(el)
          setQuery(beforeCursor.slice(lastOpen + 2))
          return
        }
      }

      setAnchorEl(null)
      setCaretRect(null)
      setQuery('')
    }, [onChange])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      // Always stop propagation so React Flow doesn't intercept editing keys
      e.stopPropagation()

      // Force <br> instead of <div> on Enter
      if (e.key === 'Enter' && !e.shiftKey) {
        // Let InlineSuggestions handle Enter when open; otherwise insert newline
        if (!anchorEl) {
          e.preventDefault()
          document.execCommand('insertLineBreak')
        }
      }
    }, [anchorEl])

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      e.preventDefault()
      const plain = e.clipboardData.getData('text/plain')
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const r = sel.getRangeAt(0)
      r.deleteContents()
      const lines = plain.split('\n')
      const frag = document.createDocumentFragment()
      lines.forEach((line, i) => {
        if (i > 0) frag.appendChild(document.createElement('br'))
        if (line) frag.appendChild(document.createTextNode(line))
      })
      r.insertNode(frag)
      r.collapse(false)
      sel.removeAllRanges()
      sel.addRange(r)
      if (editorRef.current) {
        const serialized = serializeEditor(editorRef.current)
        setIsEmpty(!serialized.trim())
        onChange(serialized)
      }
    }, [onChange])

    const pickerButton = (
      <button
        ref={pickerBtnRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setPickerAnchor(pickerAnchor ? null : pickerBtnRef.current)}
        className={`flex items-center justify-center w-6 h-6 rounded border transition-colors flex-shrink-0 ${
          pickerAnchor
            ? 'bg-blue-600/20 border-blue-500/30 text-blue-400'
            : 'bg-pilos-card border-pilos-border text-zinc-500 hover:text-white hover:border-zinc-600'
        }`}
        title="Pick variable from upstream steps"
      >
        <Icon icon="lucide:braces" className="text-[9px]" />
      </button>
    )

    return (
      <div>
        {/* Label row (when label provided) — includes hint + picker button */}
        {label ? (
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-zinc-400">{label}</label>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-zinc-600">type {'{{'}  to insert</span>
              {pickerButton}
              {pickerAnchor && (
                <DataPicker
                  currentNodeId={nodeId}
                  onSelect={(r) => { insertRef(r); setPickerAnchor(null) }}
                  anchorEl={pickerAnchor}
                  onClose={() => setPickerAnchor(null)}
                />
              )}
            </div>
          </div>
        ) : null}

        <div className="relative">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
            className={`code-editor custom-scrollbar overflow-y-auto outline-none whitespace-pre-wrap break-words ${
              compact ? 'min-h-[40px] max-h-[120px]' : 'min-h-[160px] max-h-[400px]'
            }`}
          />
          {isEmpty && placeholder && (
            <div className={`absolute top-0 left-0 text-[11px] text-zinc-600 pointer-events-none font-mono whitespace-pre-wrap leading-relaxed ${compact ? 'p-2.5' : 'p-4'}`}>
              {placeholder}
            </div>
          )}
          {/* Floating picker button when no label row */}
          {!label && (
            <div className="absolute top-1.5 right-1.5 z-10">
              {pickerButton}
              {pickerAnchor && (
                <DataPicker
                  currentNodeId={nodeId}
                  onSelect={(r) => { insertRef(r); setPickerAnchor(null) }}
                  anchorEl={pickerAnchor}
                  onClose={() => setPickerAnchor(null)}
                />
              )}
            </div>
          )}
          <InlineSuggestions
            currentNodeId={nodeId}
            query={query}
            anchorEl={anchorEl}
            caretRect={caretRect}
            onSelect={insertRef}
            onClose={() => { setAnchorEl(null); setCaretRect(null); setQuery('') }}
          />
        </div>
      </div>
    )
  },
)

PromptEditor.displayName = 'PromptEditor'
