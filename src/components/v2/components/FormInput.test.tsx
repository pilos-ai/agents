// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormInput } from './FormInput'

describe('FormInput', () => {
  it('renders with label', () => {
    render(<FormInput label="Email" />)
    expect(screen.getByText('Email')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<FormInput />)
    expect(container.querySelector('label')).toBeNull()
  })

  it('renders an input element', () => {
    render(<FormInput placeholder="Enter text" />)
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument()
  })

  it('forwards className to input', () => {
    render(<FormInput className="custom-class" placeholder="test" />)
    const input = screen.getByPlaceholderText('test')
    expect(input.className).toContain('custom-class')
    expect(input.className).toContain('form-input')
  })

  it('handles value and onChange', async () => {
    const onChange = vi.fn()
    render(<FormInput value="" onChange={onChange} placeholder="type" />)
    await userEvent.type(screen.getByPlaceholderText('type'), 'hello')
    expect(onChange).toHaveBeenCalled()
  })

  it('forwards HTML attributes like type and disabled', () => {
    render(<FormInput type="password" disabled placeholder="pw" />)
    const input = screen.getByPlaceholderText('pw')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toBeDisabled()
  })

  it('has displayName', () => {
    expect(FormInput.displayName).toBe('FormInput')
  })
})
