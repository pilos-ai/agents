// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormToggle } from './FormToggle'

describe('FormToggle', () => {
  it('renders with label', () => {
    render(<FormToggle checked={false} onChange={() => {}} label="Dark Mode" />)
    expect(screen.getByText('Dark Mode')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    // The component always renders the decorative `.switch`/`.knob` spans, so we
    // assert that no text-bearing label span is rendered rather than expecting
    // zero <span> elements.
    const { container } = render(<FormToggle checked={false} onChange={() => {}} />)
    const textSpans = Array.from(container.querySelectorAll('span')).filter(
      (span) => span.textContent && span.textContent.trim().length > 0,
    )
    expect(textSpans).toHaveLength(0)
  })

  it('calls onChange when toggled', () => {
    // The visible switch is decorative; the real <input type="checkbox"> has
    // `pointer-events: none`, so we toggle it directly via fireEvent.click.
    const onChange = vi.fn()
    render(<FormToggle checked={false} onChange={onChange} label="Toggle" />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when unchecked', () => {
    const onChange = vi.fn()
    render(<FormToggle checked={true} onChange={onChange} label="Toggle" />)
    fireEvent.click(screen.getByRole('checkbox'))
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
    // Use the real click affordance (the <label>) via userEvent, which honours
    // the disabled state of the associated control. fireEvent.click bypasses
    // `disabled` in jsdom, so it cannot exercise this contract.
    const onChange = vi.fn()
    const { container } = render(<FormToggle checked={false} onChange={onChange} disabled />)
    const labelEl = container.querySelector('label') as HTMLLabelElement
    await userEvent.click(labelEl)
    expect(onChange).not.toHaveBeenCalled()
  })
})
