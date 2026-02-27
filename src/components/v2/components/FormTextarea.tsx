import { TextareaHTMLAttributes, forwardRef } from 'react'

interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  codeEditor?: boolean
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  ({ label, codeEditor = false, className = '', ...props }, ref) => {
    return (
      <div>
        {label && (
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
        )}
        <textarea
          ref={ref}
          className={`${codeEditor ? 'code-editor' : 'form-input'} custom-scrollbar ${className}`}
          {...props}
        />
      </div>
    )
  }
)

FormTextarea.displayName = 'FormTextarea'
