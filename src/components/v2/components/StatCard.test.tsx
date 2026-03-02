// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './StatCard'

// Mock the Icon component (web component doesn't work in jsdom)
vi.mock('../../common/Icon', () => ({
  Icon: (props: { icon: string; className?: string }) => (
    <span data-testid={`icon-${props.icon}`} className={props.className} />
  ),
}))

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Tokens" value="12,345" />)
    expect(screen.getByText('Total Tokens')).toBeInTheDocument()
    expect(screen.getByText('12,345')).toBeInTheDocument()
  })

  it('renders numeric value', () => {
    render(<StatCard label="Sessions" value={42} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<StatCard label="Cost" value="$1.23" icon="lucide:dollar-sign" />)
    expect(screen.getByTestId('icon-lucide:dollar-sign')).toBeInTheDocument()
  })

  it('does not render icon when not provided', () => {
    const { container } = render(<StatCard label="Cost" value="$1.23" />)
    expect(container.querySelector('[data-testid^="icon-"]')).toBeNull()
  })

  it('renders positive trend in green', () => {
    render(<StatCard label="Growth" value="100" trend={{ value: '12%', positive: true }} />)
    const trend = screen.getByText('+12%')
    expect(trend.className).toContain('text-emerald-400')
  })

  it('renders negative trend in red', () => {
    render(<StatCard label="Growth" value="100" trend={{ value: '5%', positive: false }} />)
    const trend = screen.getByText('5%')
    expect(trend.className).toContain('text-red-400')
  })

  it('does not render trend when not provided', () => {
    const { container } = render(<StatCard label="Test" value="0" />)
    expect(container.querySelector('.text-emerald-400')).toBeNull()
    expect(container.querySelector('.text-red-400')).toBeNull()
  })

  it('forwards className to container', () => {
    const { container } = render(<StatCard label="Test" value="0" className="custom-card" />)
    expect(container.firstElementChild?.className).toContain('custom-card')
  })
})
