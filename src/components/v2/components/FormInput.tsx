import { InputHTMLAttributes, forwardRef } from 'react'

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <div className="field">
        {label && <label>{label}</label>}
        <input
          ref={ref}
          // `control` is the prototype's input chrome; keep `form-input` for
          // backward compatibility with any test snapshots that still assert on it.
          className={`control form-input ${className}`}
          {...props}
        />
      </div>
    )
  }
)

FormInput.displayName = 'FormInput'
