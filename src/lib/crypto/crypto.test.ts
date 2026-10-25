import { describe, expect, it } from 'vitest'
import { toBase64 } from './bytes'
import {
  createNoteKey,
  decryptContent,
  encryptContent,
  isEncryptedContent,
  unlockContent,
} from './envelope'
import { isCryptoError } from './errors'
import type { KdfParams } from './kdf'

// Cheap parameters: the algorithm is the same, the test just must not spend a second per key.
const FAST: KdfParams = { m: 8, t: 1, p: 1 }
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

const failsWith = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(isCryptoError(error) && error.code).toBe(code)
}

describe('document encryption', () => {
  it('round-trips text, including unicode and long content', async () => {
    const key = await createNoteKey('correct horse', FAST)
    const text = `# Título ñ 🔒\n\n${'lorem ipsum '.repeat(20_000)}`

    const stored = await encryptContent(key, text, ID)

    expect(isEncryptedContent(stored)).toBe(true)
    expect(stored).not.toContain('lorem ipsum') // a space cannot occur in base64
    expect(await decryptContent(key, stored, ID)).toBe(text)
  })

  it('opens with the password alone, using the parameters stored in the envelope', async () => {
    const key = await createNoteKey('correct horse', FAST)
    const stored = await encryptContent(key, 'secret', ID)

    const { plaintext, noteKey } = await unlockContent(stored, 'correct horse', ID)

    expect(plaintext).toBe('secret')
    expect(noteKey.params).toEqual(FAST)
    // The recovered key keeps working for later saves.
    expect(await decryptContent(noteKey, await encryptContent(noteKey, 'again', ID), ID)).toBe(
      'again',
    )
  })

  it('rejects a wrong password', async () => {
    const key = await createNoteKey('correct horse', FAST)
    const stored = await encryptContent(key, 'secret', ID)

    await failsWith(unlockContent(stored, 'wrong horse', ID), 'wrong_password')
  })

  it('never reuses a nonce', async () => {
    const key = await createNoteKey('pw', FAST)

    const stored = await Promise.all(Array.from({ length: 20 }, () => encryptContent(key, 'x', ID)))

    expect(new Set(stored).size).toBe(20)
  })

  it('detects tampered ciphertext', async () => {
    const key = await createNoteKey('pw', FAST)
    const stored = await encryptContent(key, 'secret', ID)
    const envelope = JSON.parse(atob(stored.slice('lnenc:v1:'.length)))
    const ct = Uint8Array.from(atob(envelope.ct), (c) => c.charCodeAt(0))
    ct[0] ^= 1
    envelope.ct = toBase64(ct)

    await failsWith(
      decryptContent(key, `lnenc:v1:${btoa(JSON.stringify(envelope))}`, ID),
      'wrong_password',
    )
  })

  it('does not decrypt under another note id', async () => {
    const key = await createNoteKey('pw', FAST)
    const stored = await encryptContent(key, 'secret', ID)

    await failsWith(decryptContent(key, stored, 'another-note'), 'wrong_password')
  })

  it('refuses unknown versions and malformed or abusive envelopes', async () => {
    const key = await createNoteKey('pw', FAST)
    const good = await encryptContent(key, 'secret', ID)
    const envelope = JSON.parse(atob(good.slice('lnenc:v1:'.length)))
    const wrap = (e: object) => `lnenc:v1:${btoa(JSON.stringify(e))}`

    await failsWith(unlockContent(good.replace('v1', 'v9'), 'pw', ID), 'unsupported')
    await failsWith(unlockContent('lnenc:v1:%%%', 'pw', ID), 'malformed')
    await failsWith(unlockContent('plain text', 'pw', ID), 'malformed')
    // A tampered envelope must not make the browser allocate an absurd amount of memory.
    await failsWith(unlockContent(wrap({ ...envelope, m: 2 ** 30 }), 'pw', ID), 'malformed')
  })

  it('treats equivalent unicode passwords as the same', async () => {
    const key = await createNoteKey('café', FAST) // precomposed é
    const stored = await encryptContent(key, 'secret', ID)

    const { plaintext } = await unlockContent(stored, 'café', ID) // e + combining accent

    expect(plaintext).toBe('secret')
  })
})
