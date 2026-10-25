import { argon2id } from 'hash-wasm'

/** Argon2id cost: memory in KiB, iterations and lanes. Stored in every envelope, so it can be raised later. */
export interface KdfParams {
  m: number
  t: number
  p: number
}

export const DEFAULT_KDF: KdfParams = { m: 64 * 1024, t: 3, p: 1 }

/** Bounds accepted when reading an envelope: a tampered one must not make the browser allocate gigabytes. */
export const KDF_LIMITS = { mMax: 1024 * 1024, tMax: 20, pMax: 8 }

export const normalizePassword = (password: string): string => password.normalize('NFKC')

export function deriveInline(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Uint8Array> {
  return argon2id({
    password: normalizePassword(password),
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: 32,
    outputType: 'binary',
  })
}

/**
 * Derives 32 bytes from the password. It runs in a throwaway Web Worker so the page does not freeze for the
 * second the hash takes (and the memory it used is released); without Workers (tests) it runs inline.
 */
export function deriveKeyBytes(
  password: string,
  salt: Uint8Array,
  params: KdfParams,
): Promise<Uint8Array> {
  if (typeof Worker === 'undefined') return deriveInline(password, salt, params)

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' })
    const done = () => worker.terminate()
    worker.onmessage = (event: MessageEvent<Uint8Array>) => {
      done()
      resolve(event.data)
    }
    worker.onerror = (event) => {
      done()
      reject(new Error(event.message || 'key derivation failed'))
    }
    worker.postMessage({ password, salt, params })
  })
}
