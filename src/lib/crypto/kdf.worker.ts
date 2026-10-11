import { deriveInline, type KdfParams } from './kdf'

self.onmessage = async (
  event: MessageEvent<{ password: string; salt: Uint8Array; params: KdfParams }>,
) => {
  const { password, salt, params } = event.data
  const bytes = await deriveInline(password, salt, params)
  ;(self as unknown as Worker).postMessage(bytes)
}
