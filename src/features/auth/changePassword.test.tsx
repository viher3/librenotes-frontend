import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/data/errors'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'
import { openAccount } from '@/test/createMenu'

const NEW_PASSWORD = 'a-brand-new-password'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  localStorage.clear()
})

type Rendered = Awaited<ReturnType<typeof renderApp>>

async function openDialog() {
  const mock = await createBackend()
  await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
  const app = await renderApp('/', mock)
  await openAccount(app.user)
  await app.user.click(await screen.findByRole('button', { name: 'Change password' }))
  const dialog = await screen.findByRole('dialog', { name: 'Change password' })
  return { mock, ...app, dialog }
}

async function fill(
  user: Rendered['user'],
  dialog: HTMLElement,
  values: { current?: string; next?: string; confirm?: string },
) {
  const field = (name: string) => within(dialog).getByLabelText(name)
  if (values.current !== undefined) await user.type(field('Current password'), values.current)
  if (values.next !== undefined) await user.type(field('New password'), values.next)
  if (values.confirm !== undefined)
    await user.type(field('Repeat the new password'), values.confirm)
}

const submit = (user: Rendered['user'], dialog: HTMLElement) =>
  user.click(within(dialog).getByRole('button', { name: 'Change password' }))

describe('change password dialog', () => {
  it('opens from the account menu with the first field focused and the passwords hidden', async () => {
    const { dialog } = await openDialog()

    const current = within(dialog).getByLabelText('Current password')
    expect(current).toHaveFocus()
    expect(current).toHaveAttribute('autocomplete', 'current-password')
    expect(current).toHaveAttribute('type', 'password')
    for (const label of ['New password', 'Repeat the new password']) {
      expect(within(dialog).getByLabelText(label)).toHaveAttribute('autocomplete', 'new-password')
      expect(within(dialog).getByLabelText(label)).toHaveAttribute('type', 'password')
    }
    expect(within(dialog).getByText('Between 8 and 44 characters.')).toBeInTheDocument()
  })

  it('reveals each field on its own and hides them again when the dialog is reopened', async () => {
    const { user, dialog } = await openDialog()

    const toggles = within(dialog).getAllByRole('button', { name: 'Show password' })
    expect(toggles).toHaveLength(3)
    await user.click(toggles[1])
    expect(within(dialog).getByLabelText('New password')).toHaveAttribute('type', 'text')
    expect(within(dialog).getByLabelText('Current password')).toHaveAttribute('type', 'password')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await openAccount(user)
    await user.click(await screen.findByRole('button', { name: 'Change password' }))

    const reopened = await screen.findByRole('dialog', { name: 'Change password' })
    expect(within(reopened).getByLabelText('New password')).toHaveAttribute('type', 'password')
    expect(within(reopened).getByLabelText('New password')).toHaveValue('')
  })

  it('shows the strength meter for the new password only', async () => {
    const { user, dialog } = await openDialog()

    expect(within(dialog).queryByRole('meter')).not.toBeInTheDocument()
    await fill(user, dialog, { current: 'x', confirm: 'abc' })
    expect(within(dialog).queryByRole('meter')).not.toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('New password'), 'Kx9_mQ4wTz7#vB2rLn5@')

    expect(await within(dialog).findByRole('meter', { name: 'Password strength' })).toHaveAttribute(
      'aria-valuetext',
      'Strong',
    )
    expect(within(dialog).getAllByRole('meter')).toHaveLength(1)
  })

  it('validates before calling the server', async () => {
    const { mock, user, dialog } = await openDialog()
    const change = vi.spyOn(mock.auth, 'changePassword')

    await submit(user, dialog)
    expect(await within(dialog).findByText('This field is required')).toBeInTheDocument()

    await fill(user, dialog, { current: ACCOUNT.password, next: 'short', confirm: 'other' })
    await submit(user, dialog)
    expect(await within(dialog).findByText('Use at least 8 characters')).toBeInTheDocument()
    expect(within(dialog).getByText('The passwords do not match')).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('refuses a new password longer than 44 characters', async () => {
    const { mock, user, dialog } = await openDialog()
    const change = vi.spyOn(mock.auth, 'changePassword')
    const long = 'a'.repeat(45)

    await fill(user, dialog, { current: ACCOUNT.password, next: long, confirm: long })
    await submit(user, dialog)

    expect(await within(dialog).findByText('Use at most 44 characters')).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('refuses the same password as the current one', async () => {
    const { mock, user, dialog } = await openDialog()
    const change = vi.spyOn(mock.auth, 'changePassword')

    await fill(user, dialog, {
      current: ACCOUNT.password,
      next: ACCOUNT.password,
      confirm: ACCOUNT.password,
    })
    await submit(user, dialog)

    expect(
      await within(dialog).findByText('The new password must be different from the current one'),
    ).toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })

  it('changes the password, signs the user out and tells them on the sign-in page', async () => {
    const { mock, user, router, dialog } = await openDialog()

    await fill(user, dialog, {
      current: ACCOUNT.password,
      next: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    })
    await submit(user, dialog)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your password was changed. Sign in with the new one.',
    )
    expect(router.state.location.pathname).toBe('/login')
    expect(mock.session.hasSession).toBe(false)
    expect(screen.queryByText('Your session has expired. Please sign in again.')).toBeNull()

    // Only the new password works from here on.
    await user.type(screen.getByLabelText('Email'), ACCOUNT.email)
    await user.type(screen.getByLabelText('Password'), ACCOUNT.password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is not correct.',
    )

    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
  })

  it('shows a wrong current password under that field and keeps everything typed', async () => {
    const { user, dialog } = await openDialog()

    await fill(user, dialog, {
      current: 'not-the-password',
      next: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    })
    await submit(user, dialog)

    expect(
      await within(dialog).findByText('The current password is not correct.'),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Current password')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(within(dialog).getByLabelText('New password')).toHaveValue(NEW_PASSWORD)
    expect(screen.getByRole('dialog', { name: 'Change password' })).toBeInTheDocument()
  })

  it.each([
    ['user.password_unchanged', {}, 'The new password must be different from the current one.'],
    [
      'user.invalid_new_password',
      { min: 8, max: 44 },
      'The new password must be between 8 and 44 characters long.',
    ],
  ])('puts %s on the new password field', async (code, params, message) => {
    const { mock, user, dialog } = await openDialog()
    vi.spyOn(mock.auth, 'changePassword').mockRejectedValue(
      new ApiError({ status: 422, code, params }),
    )

    await fill(user, dialog, {
      current: ACCOUNT.password,
      next: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    })
    await submit(user, dialog)

    expect(await within(dialog).findByText(message)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps what was typed and explains a network failure', async () => {
    const { mock, user, dialog } = await openDialog()
    vi.spyOn(mock.auth, 'changePassword').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )

    await fill(user, dialog, {
      current: ACCOUNT.password,
      next: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    })
    await submit(user, dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'We could not reach the server. Check your connection and try again.',
    )
    expect(within(dialog).getByLabelText('Current password')).toHaveValue(ACCOUNT.password)
    expect(within(dialog).getByRole('button', { name: 'Change password' })).toBeEnabled()
  })

  it('disables the form while the request is in flight', async () => {
    const { mock, user, dialog } = await openDialog()
    let finish!: () => void
    vi.spyOn(mock.auth, 'changePassword').mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    )

    await fill(user, dialog, {
      current: ACCOUNT.password,
      next: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
    })
    await submit(user, dialog)

    expect(await within(dialog).findByRole('button', { name: 'Changing…' })).toBeDisabled()
    expect(within(dialog).getByLabelText('New password')).toBeDisabled()
    await act(async () => finish())
  })
})

describe('change password lockout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  it('locks the form with a countdown after three wrong attempts and unlocks it at zero', async () => {
    const { user, dialog } = await openDialog()
    const typed = { current: 'wrong-password', next: NEW_PASSWORD, confirm: NEW_PASSWORD }

    await fill(user, dialog, typed)
    for (let attempt = 0; attempt < 3; attempt++) {
      await submit(user, dialog)
      await within(dialog).findByText('The current password is not correct.')
    }
    // The fourth attempt, even with the right password, is refused with a countdown.
    await user.clear(within(dialog).getByLabelText('Current password'))
    await user.type(within(dialog).getByLabelText('Current password'), ACCOUNT.password)
    await submit(user, dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Too many failed attempts. Try again in 15:00.',
    )
    expect(within(dialog).getByLabelText('Current password')).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Change password' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Try again in 14:5')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000)
    })
    await waitFor(() => expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument())
    expect(within(dialog).getByLabelText('Current password')).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Change password' })).toBeEnabled()
  })
})
