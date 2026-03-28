import { useRef, useCallback, useState } from 'react'

/**
 * Detects when the user types `{{` in a textarea and returns state to
 * show inline suggestions. On selection, replaces the unclosed `{{...`
 * with the chosen template ref.
 *
 * Usage:
 *   const ac = useTemplateAutocomplete(value, onChange)
 *   <textarea {...ac.textareaProps} />
 *   {ac.anchorEl && <InlineSuggestions anchorEl={ac.anchorEl} query={ac.query} onSelect={ac.onPickerSelect} onClose={ac.onPickerClose} ... />}
 */
export function useTemplateAutocomplete(
  value: string,
  onChange: (next: string) => void,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [query, setQuery] = useState('')

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value
      onChange(next)

      // Detect unclosed `{{` before the cursor
      const cursor = e.target.selectionStart ?? next.length
      const before = next.slice(0, cursor)
      const lastOpen = before.lastIndexOf('{{')
      const lastClose = before.lastIndexOf('}}')

      if (lastOpen !== -1 && lastOpen > lastClose) {
        setAnchorEl(e.target)
        setQuery(before.slice(lastOpen + 2)) // text typed after {{
      } else {
        setAnchorEl(null)
        setQuery('')
      }
    },
    [onChange],
  )

  const onPickerSelect = useCallback(
    (ref: string) => {
      const ta = textareaRef.current
      const cursor = ta?.selectionStart ?? value.length
      const before = value.slice(0, cursor)
      const after = value.slice(cursor)

      // Find the unclosed {{ and replace from there
      const lastOpen = before.lastIndexOf('{{')
      const newValue = before.slice(0, lastOpen) + ref + after

      onChange(newValue)
      setAnchorEl(null)
      setQuery('')

      // Restore cursor after the inserted ref
      requestAnimationFrame(() => {
        if (ta) {
          const pos = lastOpen + ref.length
          ta.setSelectionRange(pos, pos)
          ta.focus()
        }
      })
    },
    [value, onChange],
  )

  const onPickerClose = useCallback(() => {
    setAnchorEl(null)
    setQuery('')
  }, [])

  return {
    textareaRef,
    anchorEl,
    query,
    onPickerSelect,
    onPickerClose,
    textareaProps: {
      ref: textareaRef,
      onChange: handleChange,
    },
  }
}
