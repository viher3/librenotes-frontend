/**
 * Encrypted content is stored as `lnenc:v<version>:<base64 envelope>` (see `envelope.ts`). The backend only
 * recognises this prefix: it never holds the key. Kept apart from the cipher so the data layer can use it
 * without loading any crypto code.
 */
export const ENCRYPTED_PREFIX = 'lnenc:'

export const isEncryptedContent = (content: string): boolean => content.startsWith(ENCRYPTED_PREFIX)
