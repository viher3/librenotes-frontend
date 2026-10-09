import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * - `saved`: nothing is waiting; the server has what is on screen.
 * - `pending`: there are edits waiting for the debounce.
 * - `saving`: a request is in flight.
 * - `error`: the last attempt failed; the edits stay on screen and are retried.
 */
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

export const AUTOSAVE_DEFAULTS = {
  delayMs: 800,
  /** Wait before the n-th consecutive retry (the last value repeats). */
  retryDelaysMs: [2_000, 5_000, 15_000, 30_000],
}

export interface AutosaveOptions<T extends object> {
  /** What the server has right now. Read once: later changes do not overwrite the draft. */
  initial: T
  /** Persists only the fields that changed. Must reject on failure. */
  save: (changes: Partial<T>) => Promise<void>
  /** A field that is not valid yet (e.g. an empty title) is kept in the draft but not sent. */
  isValid?: <K extends keyof T>(field: K, value: T[K]) => boolean
  delayMs?: number
  retryDelaysMs?: number[]
}

export interface Autosave<T extends object> {
  draft: T
  status: SaveStatus
  setField: <K extends keyof T>(field: K, value: T[K]) => void
  /** Saves everything now. Resolves `true` when nothing is left unsaved. */
  flush: () => Promise<boolean>
  /** Forgets pending edits without sending them (the thing being edited no longer exists). */
  discard: () => void
}

/**
 * Keeps an editable draft and saves it in the background: debounced, one request at a time (edits made while
 * saving go out right after), retried with backoff when the server cannot be reached, and never losing what is
 * on screen. Pending edits are sent when the component unmounts.
 */
export function useAutosave<T extends object>(options: AutosaveOptions<T>): Autosave<T> {
  const [draft, setDraft] = useState<T>(options.initial)
  const [status, setStatus] = useState<SaveStatus>('saved')

  const latest = useRef(options)
  const draftRef = useRef<T>(options.initial)
  const savedRef = useRef<T>(options.initial)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<Promise<void> | null>(null)
  const failures = useRef(0)
  const unmounted = useRef(false)

  useEffect(() => {
    latest.current = options
  })

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    debounceTimer.current = retryTimer.current = null
  }, [])

  /** Fields whose draft value differs from the saved one and may be sent; null when there are none. */
  const changes = useCallback((): Partial<T> | null => {
    const { isValid } = latest.current
    const result: Partial<T> = {}
    let any = false
    for (const field of Object.keys(draftRef.current) as (keyof T)[]) {
      const value = draftRef.current[field]
      if (Object.is(value, savedRef.current[field])) continue
      if (isValid && !isValid(field, value)) continue
      result[field] = value
      any = true
    }
    return any ? result : null
  }, [])

  /** Everything the user typed that differs from the server, valid or not (decides the status shown). */
  const isDirty = useCallback(
    () =>
      (Object.keys(draftRef.current) as (keyof T)[]).some(
        (f) => !Object.is(draftRef.current[f], savedRef.current[f]),
      ),
    [],
  )

  const persist = useCallback((): Promise<void> => {
    if (inflight.current) return inflight.current // the running loop will pick up newer edits

    const run = async () => {
      for (;;) {
        const pending = changes()
        if (!pending) {
          failures.current = 0
          setStatus(isDirty() ? 'pending' : 'saved')
          return
        }
        setStatus('saving')
        try {
          await latest.current.save(pending)
        } catch {
          failures.current += 1
          setStatus('error')
          const delays = latest.current.retryDelaysMs ?? AUTOSAVE_DEFAULTS.retryDelaysMs
          // Nobody is looking any more: try one full round of retries, then stop instead of looping forever.
          if (unmounted.current && failures.current > delays.length) return
          const wait = delays[Math.min(failures.current - 1, delays.length - 1)]
          retryTimer.current = setTimeout(() => void persist(), wait)
          return
        }
        savedRef.current = { ...savedRef.current, ...pending }
        failures.current = 0
      }
    }

    inflight.current = run().finally(() => {
      inflight.current = null
    })
    return inflight.current
  }, [changes, isDirty])

  const setField = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      draftRef.current = { ...draftRef.current, [field]: value }
      setDraft(draftRef.current)

      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = null
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = null

      if (!isDirty()) {
        // Back to what the server has, e.g. typed and deleted again.
        if (!inflight.current) setStatus('saved')
        return
      }
      if (!inflight.current) setStatus('pending')
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null
        void persist()
      }, latest.current.delayMs ?? AUTOSAVE_DEFAULTS.delayMs)
    },
    [isDirty, persist],
  )

  const flush = useCallback(async () => {
    clearTimers()
    await persist()
    // `persist` returns once its loop is idle; an edit typed meanwhile may need another round.
    while (changes() && failures.current === 0) await persist()
    return !changes()
  }, [changes, clearTimers, persist])

  const discard = useCallback(() => {
    clearTimers()
    savedRef.current = draftRef.current
    setStatus('saved')
  }, [clearTimers])

  // Leaving the page must not drop what was typed in the last moments.
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      clearTimers()
      if (changes()) void persist()
    }
  }, [changes, clearTimers, persist])

  return { draft, status, setField, flush, discard }
}
