// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormToggle } from './FormToggle'

describe('FormToggle', () => {
  it('renders with label', () => {
    render(<FormToggle checked={false} onChange={() => {}} label="Dark Mode" />)
    expect(screen.getByText('Dark Mode')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<FormToggle checked={false} onChange={() => {}} />)
    expect(container.querySelector('span')).toBeNull()
  })

  it('calls onChange when toggled', async () => {
    const onChange = vi.fn()
    render(<FormToggle checked={false} onChange={onChange} label="Toggle" />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when unchecked', async () => {
    const onChange = vi.fn()
    render(<FormToggle checked={true} onChange={onChange} label="Toggle" />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('reflects checked state', () => {
    render(<FormToggle checked={true} onChange={() => {}} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('reflects unchecked state', () => {
    render(<FormToggle checked={false} onChange={() => {}} />)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('respects disabled state', () => {
    render(<FormToggle checked={false} onChange={() => {}} disabled />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })

  it('does not fire onChange when disabled', async () => {
    const onChange = vi.fn()
    render(<FormToggle checked={false} onChange={onChange} disabled />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
