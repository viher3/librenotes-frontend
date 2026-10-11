import { fromBase64, randomBytes, toBase64 } from './bytes'
import { CryptoError } from './errors'
import { DEFAULT_KDF, KDF_LIMITS, deriveKeyBytes, type KdfParams } from './kdf'
import { ENCRYPTED_PREFIX } from './marker'

export { ENCRYPTED_PREFIX, isEncryptedContent } from './marker'

const VERSION = 1
const SALT_BYTES = 16
const NONCE_BYTES = 12
const HEADER = `${ENCRYPTED_PREFIX}v${VERSION}:`

/** What is stored: `lnenc:v1:` followed by this object as JSON in base64. */
interface Envelope {
  kdf: 'argon2id'
  m: number
  t: number
  p: number
  salt: string
  nonce: string
  ct: string
}

/** Everything needed to encrypt and decrypt one document. Lives in memory only. */
export interface NoteKey {
  key: CryptoKey
  salt: Uint8Array
  params: KdfParams
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function importKey(bytes: Uint8Array): Promise<CryptoKey> {
  // Not extractable: the raw key cannot be read back from the CryptoKey, even by script running in the page.
  return crypto.subtle.importKey('raw', bytes as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

async function deriveNoteKey(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<NoteKey> {
  return { key: await importKey(await deriveKeyBytes(password, salt, params)), salt, params }
}

/** A key for a document that is not encrypted yet: new random salt, current cost parameters. */
export const createNoteKey = (password: string, params: KdfParams = DEFAULT_KDF) =>
  deriveNoteKey(password, randomBytes(SALT_BYTES), params)

function parse(content: string): Envelope {
  if (!content.startsWith(ENCRYPTED_PREFIX)) throw new CryptoError('malformed')
  if (!content.startsWith(HEADER)) throw new CryptoError('unsupported')

  let envelope: Envelope
  try {
    envelope = JSON.parse(atob(content.slice(HEADER.length))) as Envelope
  } catch {
    throw new CryptoError('malformed')
  }

  const { m, t, p } = envelope
  const integer = (n: unknown, max: number) =>
    Number.isInteger(n) && (n as number) >= 1 && (n as number) <= max
  if (
    envelope.kdf !== 'argon2id' ||
    !integer(m, KDF_LIMITS.mMax) ||
    !integer(t, KDF_LIMITS.tMax) ||
    !integer(p, KDF_LIMITS.pMax) ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.nonce !== 'string' ||
    typeof envelope.ct !== 'string'
  ) {
    throw new CryptoError('malformed')
  }
  return envelope
}

/** The stored text for this plaintext. A fresh nonce is used every time. */
export async function encryptContent(
  noteKey: NoteKey,
  plaintext: string,
  noteId: string,
): Promise<string> {
  const nonce = randomBytes(NONCE_BYTES)
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      // The note id is authenticated, so a blob cannot be moved to another note unnoticed.
      { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(noteId) },
      noteKey.key,
      encoder.encode(plaintext),
    ),
  )
  const envelope: Envelope = {
    kdf: 'argon2id',
    ...noteKey.params,
    salt: toBase64(noteKey.salt),
    nonce: toBase64(nonce),
    ct: toBase64(ct),
  }
  return HEADER + btoa(JSON.stringify(envelope))
}

/** Decrypts with a key obtained from `unlockContent`/`createNoteKey` for this very content. */
export async function decryptContent(
  noteKey: NoteKey,
  content: string,
  noteId: string,
): Promise<string> {
  const envelope = parse(content)
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(envelope.nonce),
        additionalData: encoder.encode(noteId),
      },
      noteKey.key,
      fromBase64(envelope.ct),
    )
    return decoder.decode(plain)
  } catch {
    throw new CryptoError('wrong_password')
  }
}

/** Derives the key from the password and the envelope's own parameters, and proves it by decrypting. */
export async function unlockContent(
  content: string,
  password: string,
  noteId: string,
): Promise<{ noteKey: NoteKey; plaintext: string }> {
  const { m, t, p, salt } = parse(content)
  const noteKey = await deriveNoteKey(password, fromBase64(salt), { m, t, p })
  return { noteKey, plaintext: await decryptContent(noteKey, content, noteId) }
}
