import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutosave } from './useAutosave'

interface Doc {
  title: string
  content: string
}
const initial: Doc = { title: 'Title', content: 'Body' }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const flushMicrotasks = () => act(async () => {})
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

function setup(save = vi.fn<(changes: Partial<Doc>) => Promise<void>>(async () => {}), extra = {}) {
  const hook = renderHook(() =>
    useAutosave<Doc>({ initial, save, delayMs: 800, retryDelaysMs: [1000, 2000], ...extra }),
  )
  return { ...hook, save }
}

describe('useAutosave', () => {
  it('starts saved and does nothing until something changes', async () => {
    const { result, save } = setup()

    await advance(5000)

    expect(result.current.status).toBe('saved')
    expect(result.current.draft).toEqual(initial)
    expect(save).not.toHaveBeenCalled()
  })

  it('waits for a pause in typing and sends only what changed, once', async () => {
    const { result, save } = setup()

    act(() => result.current.setField('content', 'B'))
    expect(result.current.status).toBe('pending')
    await advance(500)
    act(() => result.current.setField('content', 'Bo'))
    await advance(500)
    act(() => result.current.setField('content', 'Bod'))
    await advance(799)
    expect(save).not.toHaveBeenCalled()

    await advance(1)
    await flushMicrotasks()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ content: 'Bod' })
    expect(result.current.status).toBe('saved')
    expect(result.current.draft).toEqual({ title: 'Title', content: 'Bod' })
  })

  it('shows saving while the request is in flight', async () => {
    let finish!: () => void
    const { result, save } = setup(vi.fn(() => new Promise<void>((resolve) => (finish = resolve))))

    act(() => result.current.setField('title', 'New'))
    await advance(800)
    expect(result.current.status).toBe('saving')

    await act(async () => finish())
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('saved')
  })

  it('never overlaps requests: edits made while saving go out right after', async () => {
    const finishers: (() => void)[] = []
    let running = 0
    let maxRunning = 0
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          running += 1
          maxRunning = Math.max(maxRunning, running)
          finishers.push(() => {
            running -= 1
            resolve()
          })
        }),
    )
    const { result } = setup(save)

    act(() => result.current.setField('content', 'one'))
    await advance(800)
    expect(save).toHaveBeenCalledTimes(1)

    act(() => result.current.setField('content', 'two')) // typed while the first request is in flight
    await advance(800) // the debounce elapses, but the first request is still running
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => finishers[0]())
    await flushMicrotasks()
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ content: 'two' })

    await act(async () => finishers[1]())
    expect(result.current.status).toBe('saved')
    expect(maxRunning).toBe(1)
  })

  it('does not call the server when the text goes back to what is saved', async () => {
    const { result, save } = setup()

    act(() => result.current.setField('content', 'Bodyx'))
    act(() => result.current.setField('content', 'Body'))
    await advance(2000)

    expect(save).not.toHaveBeenCalled()
    expect(result.current.status).toBe('saved')
  })

  it('keeps the draft and retries with backoff when saving fails, then recovers', async () => {
    const save = vi
      .fn<(changes: Partial<Doc>) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined)
    const { result } = setup(save)

    act(() => result.current.setField('content', 'precious'))
    await advance(800)
    expect(result.current.status).toBe('error')
    expect(result.current.draft.content).toBe('precious')

    await advance(999)
    expect(save).toHaveBeenCalledTimes(1)
    await advance(1) // first retry after 1000 ms
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('error')

    await advance(1999)
    expect(save).toHaveBeenCalledTimes(2)
    await advance(1) // second retry after 2000 ms
    expect(save).toHaveBeenCalledTimes(3)
    expect(result.current.status).toBe('saved')
    expect(save).toHaveBeenLastCalledWith({ content: 'precious' })
  })

  it('typing again after a failure tries again without waiting for the backoff', async () => {
    const save = vi
      .fn<(changes: Partial<Doc>) => Promise<void>>()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue(undefined)
    const { result } = setup(save)
    act(() => result.current.setField('content', 'a'))
    await advance(800)
    expect(result.current.status).toBe('error')

    act(() => result.current.setField('content', 'ab'))
    await advance(800)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ content: 'ab' })
    expect(result.current.status).toBe('saved')
  })

  it('flush saves immediately and reports success or failure', async () => {
    const save = vi
      .fn<(changes: Partial<Doc>) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('x'))
    const { result } = setup(save)

    act(() => result.current.setField('title', 'Now'))
    let ok = false
    await act(async () => void (ok = await result.current.flush()))
    expect(ok).toBe(true)
    expect(save).toHaveBeenCalledWith({ title: 'Now' })
    expect(result.current.status).toBe('saved')

    act(() => result.current.setField('title', 'Again'))
    await act(async () => void (ok = await result.current.flush()))
    expect(ok).toBe(false)
    expect(result.current.status).toBe('error')
  })

  it('flush with nothing to save resolves true without calling the server', async () => {
    const { result, save } = setup()
    let ok = false

    await act(async () => void (ok = await result.current.flush()))

    expect(ok).toBe(true)
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps an invalid field in the draft without sending it, and still saves the others', async () => {
    const { result, save } = setup(undefined, {
      isValid: (field: keyof Doc, value: string) => field !== 'title' || value.trim() !== '',
    })

    act(() => result.current.setField('title', ''))
    act(() => result.current.setField('content', 'changed'))
    await advance(800)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ content: 'changed' })
    expect(result.current.draft.title).toBe('')

    act(() => result.current.setField('title', 'Fixed'))
    await advance(800)
    expect(save).toHaveBeenLastCalledWith({ title: 'Fixed' })
    expect(result.current.status).toBe('saved')
  })

  it('sends pending edits when the component goes away', async () => {
    const { result, save, unmount } = setup()

    act(() => result.current.setField('content', 'last words'))
    unmount()
    await flushMicrotasks()

    expect(save).toHaveBeenCalledWith({ content: 'last words' })
  })

  it('gives up retrying after unmount instead of looping forever', async () => {
    const save = vi
      .fn<(changes: Partial<Doc>) => Promise<void>>()
      .mockRejectedValue(new Error('down'))
    const { result, unmount } = setup(save)

    act(() => result.current.setField('content', 'x'))
    unmount()
    await advance(60_000)

    // 1 attempt + 2 retries (retryDelaysMs has 2 entries) + 1 final, then it stops
    const calls = save.mock.calls.length
    expect(calls).toBeGreaterThan(1)
    await advance(600_000)
    expect(save.mock.calls.length).toBe(calls)
  })
})
