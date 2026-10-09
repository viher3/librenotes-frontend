/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_DATA_ADAPTER: 'http' | 'mock'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
