import { TextareaHTMLAttributes, forwardRef } from 'react'

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  codeEditor?: boolean
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ label, codeEditor = false, className = '', ...props }, ref) => {
    return (
      <div className="field">
        {label && <label>{label}</label>}
        <textarea
          ref={ref}
          className={`control ${codeEditor ? 'mono code-editor' : 'form-input'} ${className}`}
          style={codeEditor ? { fontFamily: 'var(--mono)', fontSize: 12 } : undefined}
          {...props}
        />
      </div>
    )
  }
)

FormTextarea.displayName = 'FormTextarea'
