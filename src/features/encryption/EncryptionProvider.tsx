import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { ID } from '@/data/types'
import type { NoteKey } from '@/lib/crypto/envelope'
import { useAuth } from '@/features/auth/AuthProvider'

/** Unlocked documents lock again after this long without the user touching the page. */
export const AUTOLOCK_MS = 10 * 60 * 1000

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * The keys of the documents unlocked in this tab. They exist only here, in memory: a reload, signing out or the
 * inactivity timer drops them and the password is asked for again. Nothing is written to any storage.
 */
class KeyStore {
  private keys = new Map<ID, NoteKey>()
  private listeners = new Set<() => void>()

  get = (id: ID): NoteKey | undefined => this.keys.get(id)

  set(id: ID, key: NoteKey) {
    this.keys.set(id, key)
    this.emit()
  }

  forget(id: ID) {
    if (this.keys.delete(id)) this.emit()
  }

  clear() {
    if (this.keys.size === 0) return
    this.keys.clear()
    this.emit()
  }

  get size() {
    return this.keys.size
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    this.listeners.forEach((listener) => listener())
  }
}

interface Vault {
  store: KeyStore
  /** Locks every document at once. */
  lockAll: () => void
}

const VaultContext = createContext<Vault | null>(null)

export function EncryptionProvider({
  children,
  autolockMs = AUTOLOCK_MS,
}: {
  children: ReactNode
  autolockMs?: number
}) {
  const { state } = useAuth()
  const [store] = useState(() => new KeyStore())

  // Whoever signs out (or whose session ends) leaves nothing unlocked behind.
  const authenticated = state.status === 'authenticated'
  useEffect(() => {
    if (!authenticated) store.clear()
  }, [authenticated, store])

  // Inactivity timer: only runs while there is something unlocked.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const arm = () => {
      if (timer) clearTimeout(timer)
      timer = store.size > 0 ? setTimeout(() => store.clear(), autolockMs) : null
    }
    const unsubscribe = store.subscribe(arm)
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, arm, { passive: true }))
    arm()
    return () => {
      unsubscribe()
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, arm))
      if (timer) clearTimeout(timer)
    }
  }, [store, autolockMs])

  const lockAll = useCallback(() => store.clear(), [store])
  const value = useMemo(() => ({ store, lockAll }), [store, lockAll])
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

function useVault(): Vault {
  const vault = useContext(VaultContext)
  if (!vault) throw new Error('useEncryption must be used inside <EncryptionProvider>')
  return vault
}

/** The key of one document while it is unlocked, and how to change that. Re-renders when it does. */
export function useNoteKey(id: ID) {
  const { store } = useVault()
  const key = useSyncExternalStore(store.subscribe, () => store.get(id))
  return {
    key,
    unlock: (noteKey: NoteKey) => store.set(id, noteKey),
    lock: () => store.forget(id),
  }
}

export function useLockAll() {
  return useVault().lockAll
}
