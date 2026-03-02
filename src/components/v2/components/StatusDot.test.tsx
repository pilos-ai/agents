// @vitest-environment jsdom

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusDot } from './StatusDot'

describe('StatusDot', () => {
  it('renders a span element', () => {
    const { container } = render(<StatusDot color="green" />)
    expect(container.querySelector('span')).toBeTruthy()
  })

  it('applies green color class', () => {
    const { container } = render(<StatusDot color="green" />)
    expect(container.firstElementChild?.className).toContain('bg-emerald-500')
  })

  it('applies orange color class', () => {
    const { container } = render(<StatusDot color="orange" />)
    expect(container.firstElementChild?.className).toContain('bg-orange-500')
  })

  it('applies blue color class', () => {
    const { container } = render(<StatusDot color="blue" />)
    expect(container.firstElementChild?.className).toContain('bg-blue-500')
  })

  it('applies gray color class', () => {
    const { container } = render(<StatusDot color="gray" />)
    expect(container.firstElementChild?.className).toContain('bg-zinc-600')
  })

  it('applies pulse animation when pulse is true', () => {
    const { container } = render(<StatusDot color="green" pulse />)
    expect(container.firstElementChild?.className).toContain('animate-pulse-soft')
  })

  it('does not apply pulse animation by default', () => {
    const { container } = render(<StatusDot color="green" />)
    expect(container.firstElementChild?.className).not.toContain('animate-pulse-soft')
  })

  it('uses small size by default', () => {
    const { container } = render(<StatusDot color="green" />)
    expect(container.firstElementChild?.className).toContain('w-2 h-2')
  })

  it('uses medium size when specified', () => {
    const { container } = render(<StatusDot color="green" size="md" />)
    expect(container.firstElementChild?.className).toContain('w-2.5 h-2.5')
  })
})
