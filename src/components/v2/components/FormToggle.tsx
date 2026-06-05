/**
 * FormToggle — pilos-prototype `.switch` (round toggle with `.knob`).
 * Keeps a hidden `<input type="checkbox">` for accessibility + test integration;
 * the visible `.switch` button click forwards to the input via `onChange`.
 */
interface FormToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
}

export function FormToggle({ checked, onChange, label, disabled = false }: FormToggleProps) {
  return (
    <label
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        position: 'relative',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />
      <span
        className={'switch' + (checked ? ' on' : '')}
        aria-hidden="true"
      >
        <span className="knob" />
      </span>
      {label && <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{label}</span>}
    </label>
  )
}
