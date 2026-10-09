import { screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { activationTokenFor } from '@/data/mock'
import { ApiError } from '@/data/errors'
import i18n from '@/lib/i18n'
import { ACCOUNT, createBackend, renderApp } from '@/test/renderApp'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const signIn = async (
  user: Awaited<ReturnType<typeof renderApp>>['user'],
  password = ACCOUNT.password,
) => {
  await user.type(await screen.findByLabelText('Email'), ACCOUNT.email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('sign in', () => {
  it('sends anonymous visitors to the sign-in page and brings them back after signing in', async () => {
    const mock = await createBackend()
    const { user, router } = await renderApp('/some/missing/page?x=1', mock)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')

    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/some/missing/page')
    expect(router.state.location.search).toBe('?x=1')
    expect(screen.getByText('ada')).toBeInTheDocument()
  })

  it('goes home after a plain sign-in', async () => {
    const mock = await createBackend()
    const { user, router } = await renderApp('/login', mock)

    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('validates before calling the server', async () => {
    const mock = await createBackend()
    const login = vi.spyOn(mock.auth, 'login')
    const { user } = await renderApp('/login', mock)

    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findAllByText('This field is required')).toHaveLength(2)

    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'x')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(login).not.toHaveBeenCalled()
  })

  it.each([
    [
      'wrong credentials',
      new ApiError({ status: 401, code: 'security.bad_credentials' }),
      'The email or password is not correct.',
    ],
    [
      'an inactive account',
      new ApiError({ status: 403, code: 'security.inactive_user' }),
      'Your account is not active yet. Open the activation link we emailed you.',
    ],
    [
      'too many attempts',
      new ApiError({ status: 429, code: 'security.too_many_attempts' }),
      'Too many attempts. Wait a few minutes and try again.',
    ],
    [
      'no connection',
      new ApiError({ status: 0, code: 'network_error' }),
      'We could not reach the server. Check your connection and try again.',
    ],
    [
      'an unexpected failure',
      new ApiError({ status: 500, code: 'internal_error' }),
      'Something went wrong. Please try again.',
    ],
  ])('explains %s', async (_name, error, message) => {
    const mock = await createBackend()
    vi.spyOn(mock.auth, 'login').mockRejectedValue(error)
    const { user } = await renderApp('/login', mock)

    await signIn(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })

  it('rejects wrong passwords against the account and keeps the user on the page', async () => {
    const mock = await createBackend()
    const { user, router } = await renderApp('/login', mock)

    await signIn(user, 'wrong-password')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password is not correct.',
    )
    expect(router.state.location.pathname).toBe('/login')
  })

  it('disables the button while the request is in flight', async () => {
    const mock = await createBackend()
    let finish!: () => void
    const original = mock.auth.login.bind(mock.auth)
    vi.spyOn(mock.auth, 'login').mockImplementation(
      (email, password) =>
        new Promise((resolve) => (finish = () => resolve(original(email, password)))),
    )
    const { user } = await renderApp('/login', mock)

    await signIn(user)

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
    finish()
    expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
  })

  it('keeps signed-in users away from the public pages', async () => {
    const mock = await createBackend()
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)

    for (const path of ['/login', '/register']) {
      const { router, unmount } = await renderApp(path, mock)
      expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/')
      unmount()
    }
  })
})

describe('session', () => {
  it('resumes a stored session without asking for credentials', async () => {
    const mock = await createBackend()
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)

    await renderApp('/', mock)

    expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
  })

  it('shows a loading state while the session is being restored', async () => {
    const mock = await createBackend()
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
    let resolve!: () => void
    const restore = mock.auth.restoreSession.bind(mock.auth)
    vi.spyOn(mock.auth, 'restoreSession').mockImplementation(
      () => new Promise((r) => (resolve = () => r(restore()))),
    )

    await renderApp('/', mock)

    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    resolve()
    expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
  })

  it('falls back to the sign-in page if the stored session cannot be restored', async () => {
    const mock = await createBackend()
    vi.spyOn(mock.auth, 'restoreSession').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )

    await renderApp('/', mock)

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('signs out, without remembering where the user was', async () => {
    const mock = await createBackend()
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
    const { user, router } = await renderApp('/', mock)

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: undefined })
    expect(mock.session.hasSession).toBe(false)
    await expect(mock.notes.listNotes()).rejects.toMatchObject({ status: 401 })
  })

  it('tells the user when the session ends on its own, and returns them to where they were', async () => {
    const mock = await createBackend()
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
    const { user, router } = await renderApp('/some/page', mock)
    await screen.findByRole('heading', { name: 'Page not found' })

    mock.session.clear() // what the HTTP client does when the refresh token is rejected

    expect(
      await screen.findByText('Your session has expired. Please sign in again.'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')

    await signIn(user)
    await waitFor(() => expect(router.state.location.pathname).toBe('/some/page'))
  })
})

describe('sign up', () => {
  it('registers and asks the user to check their email', async () => {
    const mock = await createBackend()
    const signUp = vi.spyOn(mock.auth, 'signUp')
    const { user } = await renderApp('/register', mock)

    await user.type(await screen.findByLabelText('Email'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'another-secret')
    await user.type(screen.getByLabelText('Repeat the password'), 'another-secret')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(screen.getByText(/grace@example\.com/)).toBeInTheDocument()
    expect(signUp).toHaveBeenCalledWith({
      email: 'grace@example.com',
      password: 'another-secret',
      username: undefined,
    })
  })

  it('sends the optional username when given', async () => {
    const mock = await createBackend()
    const signUp = vi.spyOn(mock.auth, 'signUp')
    const { user } = await renderApp('/register', mock)

    await user.type(await screen.findByLabelText('Email'), 'grace@example.com')
    await user.type(screen.getByLabelText(/Username/), 'grace_h')
    await user.type(screen.getByLabelText('Password'), 'another-secret')
    await user.type(screen.getByLabelText('Repeat the password'), 'another-secret')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    await screen.findByRole('heading', { name: 'Check your email' })
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ username: 'grace_h' }))
  })

  it('validates the form', async () => {
    const mock = await createBackend()
    const signUp = vi.spyOn(mock.auth, 'signUp')
    const { user } = await renderApp('/register', mock)

    await user.type(await screen.findByLabelText('Email'), 'nope')
    await user.type(screen.getByLabelText(/Username/), 'ab')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.type(screen.getByLabelText('Repeat the password'), 'different')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Use between 3 and 20 characters')).toBeInTheDocument()
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('The passwords do not match')).toBeInTheDocument()
    expect(signUp).not.toHaveBeenCalled()
  })

  it('reports an email that is already registered on the field', async () => {
    const mock = await createBackend()
    const { user } = await renderApp('/register', mock)

    await user.type(await screen.findByLabelText('Email'), ACCOUNT.email)
    await user.type(screen.getByLabelText('Password'), 'another-secret')
    await user.type(screen.getByLabelText('Repeat the password'), 'another-secret')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(
      await screen.findByText('There is already an account with this email.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows other failures for the whole form', async () => {
    const mock = await createBackend()
    vi.spyOn(mock.auth, 'signUp').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )
    const { user } = await renderApp('/register', mock)

    await user.type(await screen.findByLabelText('Email'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'another-secret')
    await user.type(screen.getByLabelText('Repeat the password'), 'another-secret')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not reach the server')
  })

  it('a new account cannot sign in until it is activated', async () => {
    const mock = await createBackend()
    const { user } = await renderApp('/register', mock)
    await user.type(await screen.findByLabelText('Email'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'another-secret')
    await user.type(screen.getByLabelText('Repeat the password'), 'another-secret')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await screen.findByRole('heading', { name: 'Check your email' })

    await user.click(screen.getByRole('link', { name: 'Back to sign in' }))
    await user.type(await screen.findByLabelText('Email'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'another-secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Your account is not active yet')
  })
})

describe('activation', () => {
  it('activates the account from the emailed link, then invites the user to sign in', async () => {
    const mock = await createBackend()
    await mock.auth.signUp({ email: 'grace@example.com', password: 'another-secret' })
    const { user, router } = await renderApp(
      `/activate?token=${encodeURIComponent(activationTokenFor('grace@example.com'))}`,
      mock,
    )

    expect(await screen.findByText('Your account is active.')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your account is active. You can sign in now.',
    )
    expect(router.state.location.pathname).toBe('/login')
    await user.type(screen.getByLabelText('Email'), 'grace@example.com')
    await user.type(screen.getByLabelText('Password'), 'another-secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Your documents' })).toBeInTheDocument()
  })

  it('activates only once even though the page renders twice (StrictMode)', async () => {
    const mock = await createBackend()
    await mock.auth.signUp({ email: 'grace@example.com', password: 'another-secret' })
    const activate = vi.spyOn(mock.auth, 'activate')

    await renderApp(`/activate?token=${activationTokenFor('grace@example.com')}`, mock)

    await screen.findByText('Your account is active.')
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'an invalid or used link',
      new ApiError({ status: 404, code: 'user.invalid_activation_token' }),
      'This activation link is not valid or was already used.',
    ],
    [
      'an expired link',
      new ApiError({ status: 410, code: 'user.activation_token_expired' }),
      'This activation link has expired.',
    ],
  ])('explains %s', async (_name, error, message) => {
    const mock = await createBackend()
    vi.spyOn(mock.auth, 'activate').mockRejectedValue(error)

    await renderApp('/activate?token=abc', mock)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('explains an incomplete link without calling the server', async () => {
    const mock = await createBackend()
    const activate = vi.spyOn(mock.auth, 'activate')

    await renderApp('/activate', mock)

    expect(await screen.findByRole('alert')).toHaveTextContent('This activation link is incomplete')
    expect(activate).not.toHaveBeenCalled()
  })

  it('works while signed in too', async () => {
    const mock = await createBackend()
    await mock.auth.signUp({ email: 'grace@example.com', password: 'another-secret' })
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)

    await renderApp(`/activate?token=${activationTokenFor('grace@example.com')}`, mock)

    expect(await screen.findByText('Your account is active.')).toBeInTheDocument()
  })
})

describe('language', () => {
  it("adopts the account's language at sign-in", async () => {
    const mock = await createBackend()
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
    await mock.auth.updateProfile({ locale: 'es' })
    await mock.auth.logout()
    const { user } = await renderApp('/login', mock)

    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Tus documentos' })).toBeInTheDocument()
    expect(i18n.resolvedLanguage).toBe('es')
  })

  it('saves the language chosen by a signed-in user as their preference', async () => {
    const mock = await createBackend()
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
    const updateProfile = vi.spyOn(mock.auth, 'updateProfile')
    const { user } = await renderApp('/', mock)

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Language' }), 'es')

    expect(await screen.findByRole('heading', { name: 'Tus documentos' })).toBeInTheDocument()
    expect(updateProfile).toHaveBeenCalledWith({ locale: 'es' })
    expect((await mock.auth.me()).locale).toBe('es')
  })

  it('changes the language of the sign-in page without touching the server', async () => {
    const mock = await createBackend()
    const updateProfile = vi.spyOn(mock.auth, 'updateProfile')
    const { user } = await renderApp('/login', mock)

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Language' }), 'es')

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('still switches the language if saving the preference fails', async () => {
    const mock = await createBackend()
    await mock.auth.login(ACCOUNT.email, ACCOUNT.password)
    vi.spyOn(mock.auth, 'updateProfile').mockRejectedValue(
      new ApiError({ status: 0, code: 'network_error' }),
    )
    const { user } = await renderApp('/', mock)

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Language' }), 'es')

    expect(await screen.findByRole('heading', { name: 'Tus documentos' })).toBeInTheDocument()
  })

  it('translates the error messages', async () => {
    const mock = await createBackend()
    const { user } = await renderApp('/login', mock)
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Language' }), 'es')

    await user.type(await screen.findByLabelText('Correo electrónico'), ACCOUNT.email)
    await user.type(screen.getByLabelText('Contraseña'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El correo o la contraseña no son correctos.',
    )
  })
})
