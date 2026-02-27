import { InputHTMLAttributes, forwardRef } from 'react'

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <div>
        {label && (
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
        )}
        <input
          ref={ref}
          className={`form-input ${className}`}
          {...props}
        />
      </div>
    )
  }
)

FormInput.displayName = 'FormInput'
