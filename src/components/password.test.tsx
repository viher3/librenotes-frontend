import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/lib/i18n'
import { PasswordField } from './PasswordField'
import { PasswordStrength } from './PasswordStrength'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('PasswordField', () => {
  it('starts hidden and reveals and hides what was typed with the button', async () => {
    const user = userEvent.setup()
    render(<PasswordField label="Secret" />)
    const input = screen.getByLabelText('Secret')

    expect(input).toHaveAttribute('type', 'password')
    await user.type(input, 'hunter22')

    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveValue('hunter22')

    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveValue('hunter22')
  })

  it('is reachable by keyboard right after the input and does not submit the form', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <PasswordField label="Secret" />
      </form>,
    )

    await user.click(screen.getByLabelText('Secret'))
    await user.tab()
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'text')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps the label, hint and error wired to the input', () => {
    render(<PasswordField label="Secret" hint="Be careful" error="Too short" />)

    expect(screen.getByLabelText('Secret')).toHaveAccessibleDescription('Be careful Too short')
    expect(screen.getByLabelText('Secret')).toHaveAttribute('aria-invalid', 'true')
  })

  it('works as a controlled field', async () => {
    const user = userEvent.setup()
    function Controlled() {
      const [value, setValue] = useState('')
      return (
        <PasswordField label="Secret" value={value} onChange={(e) => setValue(e.target.value)} />
      )
    }
    render(<Controlled />)

    await user.type(screen.getByLabelText('Secret'), 'abc')

    expect(screen.getByLabelText('Secret')).toHaveValue('abc')
  })

  it('goes back to hidden when it is mounted again', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<PasswordField label="Secret" />)
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    unmount()

    render(<PasswordField label="Secret" />)

    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password')
  })

  it('speaks Spanish too', async () => {
    await i18n.changeLanguage('es')
    render(<PasswordField label="Clave" />)

    expect(screen.getByRole('button', { name: 'Mostrar contraseña' })).toBeInTheDocument()
  })
})

describe('PasswordStrength', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const settle = () => act(() => vi.advanceTimersByTimeAsync(350))

  it('renders nothing for an empty password', () => {
    const { container } = render(<PasswordStrength password="" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows a meter with a text value, not just a colour', () => {
    render(<PasswordStrength password="Kx9_mQ4wTz7#vB2rLn5@" />)

    const meter = screen.getByRole('meter', { name: 'Password strength' })
    expect(meter).toHaveAttribute('aria-valuemin', '1')
    expect(meter).toHaveAttribute('aria-valuemax', '4')
    expect(meter).toHaveAttribute('aria-valuenow', '4')
    expect(meter).toHaveAttribute('aria-valuetext', 'Strong')
    expect(screen.getByText('Strong')).toBeVisible()
  })

  it('updates only after typing pauses', async () => {
    const { rerender } = render(<PasswordStrength password="Kx9_mQ4wTz7#vB2rLn5@" />)
    expect(screen.getByText('Strong')).toBeVisible()

    rerender(<PasswordStrength password="abc" />)
    expect(screen.getByText('Strong')).toBeVisible() // still the old value while typing

    await settle()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Weak')
    expect(screen.getByText('Try a longer phrase of several words.')).toBeVisible()
  })

  it('goes away when the field is emptied', async () => {
    const { rerender, container } = render(<PasswordStrength password="Kx9_mQ4wTz7#vB2rLn5@" />)

    rerender(<PasswordStrength password="" />)

    expect(container).toBeEmptyDOMElement()
    await settle()
    expect(container).toBeEmptyDOMElement()
  })

  it('uses what it knows about the user', () => {
    render(<PasswordStrength password="Orange-ladder-54" context={{ username: 'ladder' }} />)

    expect(screen.getByText('Do not use your name or email in the password.')).toBeVisible()
  })

  it('announces politely', () => {
    render(<PasswordStrength password="Kx9_mQ4wTz7#vB2rLn5@" />)

    expect(screen.getByTestId('password-strength')).toHaveAttribute('aria-live', 'polite')
  })
})
