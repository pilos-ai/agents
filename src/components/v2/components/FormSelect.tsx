import { SelectHTMLAttributes, forwardRef } from 'react'

interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: { value: string; label: string }[]
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  ({ label, options, className = '', ...props }, ref) => {
    return (
      <div className="field">
        {label && <label>{label}</label>}
        <select
          ref={ref}
          className={`control form-input ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    )
  }
)

FormSelect.displayName = 'FormSelect'
