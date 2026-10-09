import { describe, expect, it } from 'vitest'
import { describeRepositoryContract, type ContractSubject } from '../contract/repositoryContract'
import { SessionStore } from '../session'
import { DEMO_ACCOUNT, activationTokenFor, createMockRepositories } from './index'

async function createSubject(): Promise<ContractSubject> {
  const { auth, notes } = createMockRepositories()
  let counter = 0
  const register = async () => {
    counter += 1
    const account = { email: `user${counter}@example.com`, password: 'secret123' }
    await auth.signUp({ ...account, username: `user_${counter}` })
    await auth.activate(activationTokenFor(account.email))
    return account
  }
  return {
    auth,
    notes,
    signInNewUser: async () => {
      const account = await register()
      await auth.login(account.email, account.password)
      return account
    },
    switchTo: async (account) => {
      await auth.logout()
      await auth.login(account.email, account.password)
    },
  }
}

describeRepositoryContract('mock', createSubject)

describe('mock specifics', () => {
  it('starts empty unless seeded, and seeds a demo account with content', async () => {
    const empty = createMockRepositories()
    await expect(empty.auth.login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)).rejects.toMatchObject(
      { code: 'security.bad_credentials' },
    )

    const seeded = createMockRepositories({ seed: true })
    const user = await seeded.auth.login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
    expect(user.email).toBe(DEMO_ACCOUNT.email)
    expect((await seeded.notes.listNotes()).total).toBeGreaterThan(0)
    expect((await seeded.notes.listLinks()).total).toBeGreaterThan(0)
    expect((await seeded.notes.listTags()).length).toBeGreaterThan(0)
  })

  it('reset restores the initial state and signs out', async () => {
    const mock = createMockRepositories({ seed: true })
    await mock.auth.login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
    await mock.notes.createNote({ title: 'temporary' })

    mock.reset()

    await expect(mock.notes.listNotes()).rejects.toMatchObject({ status: 401 })
    await mock.auth.login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)
    expect((await mock.notes.search({ q: 'temporary' })).total).toBe(0)
  })

  it('resumes a session across a reload when the refresh token is stored', async () => {
    const storage = new Map<string, string>()
    const store = () =>
      new SessionStore({
        getItem: (k) => storage.get(k) ?? null,
        setItem: (k, v) => void storage.set(k, v),
        removeItem: (k) => void storage.delete(k),
      })
    const first = createMockRepositories({ seed: true, session: store() })
    await first.auth.login(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password)

    // A "reload": new session object reading the same storage; the seeded demo user has a fixed id.
    const second = createMockRepositories({ seed: true, session: store() })
    const restored = await second.auth.restoreSession()

    expect(restored?.email).toBe(DEMO_ACCOUNT.email)
  })

  it('applies the configured latency', async () => {
    const { auth } = createMockRepositories({ latencyMs: 30 })
    const started = performance.now()

    await auth.signUp({ email: 'a@b.co', password: 'secret123' })

    expect(performance.now() - started).toBeGreaterThanOrEqual(25)
  })
})
