import createClient from 'openapi-fetch'
import type { paths } from './schema'

// Token handling and session refresh are added in step 3 (authentication).
export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL })
