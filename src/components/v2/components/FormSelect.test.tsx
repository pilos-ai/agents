// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormSelect } from './FormSelect'

const OPTIONS = [
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
]

describe('FormSelect', () => {
  it('renders with label', () => {
    render(<FormSelect label="Model" options={OPTIONS} />)
    expect(screen.getByText('Model')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<FormSelect options={OPTIONS} />)
    expect(container.querySelector('label')).toBeNull()
  })

  it('renders all options', () => {
    render(<FormSelect options={OPTIONS} />)
    expect(screen.getByText('Sonnet')).toBeInTheDocument()
    expect(screen.getByText('Opus')).toBeInTheDocument()
    expect(screen.getByText('Haiku')).toBeInTheDocument()
  })

  it('renders a select element with correct option values', () => {
    render(<FormSelect options={OPTIONS} />)
    const select = screen.getByRole('combobox')
    const optionElements = select.querySelectorAll('option')
    expect(optionElements).toHaveLength(3)
    expect(optionElements[0]).toHaveValue('sonnet')
    expect(optionElements[1]).toHaveValue('opus')
  })

  it('handles onChange', async () => {
    const onChange = vi.fn()
    render(<FormSelect options={OPTIONS} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByRole('combobox'), 'opus')
    expect(onChange).toHaveBeenCalled()
  })

  it('forwards className', () => {
    render(<FormSelect options={OPTIONS} className="extra" />)
    const select = screen.getByRole('combobox')
    expect(select.className).toContain('extra')
    expect(select.className).toContain('form-input')
  })

  it('has displayName', () => {
    expect(FormSelect.displayName).toBe('FormSelect')
  })
})
