// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormTextarea } from './FormTextarea'

describe('FormTextarea', () => {
  it('renders with label', () => {
    render(<FormTextarea label="Description" />)
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<FormTextarea />)
    expect(container.querySelector('label')).toBeNull()
  })

  it('renders a textarea element', () => {
    render(<FormTextarea placeholder="Enter description" />)
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument()
  })

  it('uses form-input class by default', () => {
    render(<FormTextarea placeholder="test" />)
    const textarea = screen.getByPlaceholderText('test')
    expect(textarea.className).toContain('form-input')
    expect(textarea.className).not.toContain('code-editor')
  })

  it('uses code-editor class when codeEditor is true', () => {
    render(<FormTextarea codeEditor placeholder="code" />)
    const textarea = screen.getByPlaceholderText('code')
    expect(textarea.className).toContain('code-editor')
    expect(textarea.className).not.toContain('form-input')
  })

  it('forwards className', () => {
    render(<FormTextarea className="extra" placeholder="t" />)
    expect(screen.getByPlaceholderText('t').className).toContain('extra')
  })

  it('handles typing', async () => {
    const onChange = vi.fn()
    render(<FormTextarea onChange={onChange} placeholder="type" />)
    await userEvent.type(screen.getByPlaceholderText('type'), 'hello')
    expect(onChange).toHaveBeenCalled()
  })

  it('has displayName', () => {
    expect(FormTextarea.displayName).toBe('FormTextarea')
  })
})
