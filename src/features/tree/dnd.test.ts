import { describe, expect, it } from 'vitest'
import { canDrop, destinationOf, parseNode } from './dnd'

describe('canDrop', () => {
  it('lets anything go to the top level', () => {
    for (const kind of ['folder', 'note', 'link'] as const) {
      expect(canDrop({ kind, id: 'x' }, { type: 'root' })).toBe(true)
    }
  })

  it('lets folders go into folders but not under notes', () => {
    expect(canDrop({ kind: 'folder', id: 'a' }, { type: 'folder', id: 'b' })).toBe(true)
    expect(canDrop({ kind: 'folder', id: 'a' }, { type: 'note', id: 'b' })).toBe(false)
  })

  it('lets notes and links go into folders and under notes', () => {
    for (const kind of ['note', 'link'] as const) {
      expect(canDrop({ kind, id: 'a' }, { type: 'folder', id: 'b' })).toBe(true)
      expect(canDrop({ kind, id: 'a' }, { type: 'note', id: 'b' })).toBe(true)
    }
  })

  it('refuses dropping an item on itself, but not a different item with the same id kind', () => {
    expect(canDrop({ kind: 'folder', id: 'a' }, { type: 'folder', id: 'a' })).toBe(false)
    expect(canDrop({ kind: 'note', id: 'a' }, { type: 'note', id: 'a' })).toBe(false)
    expect(canDrop({ kind: 'note', id: 'a' }, { type: 'folder', id: 'a' })).toBe(true)
  })
})

describe('destinationOf / parseNode', () => {
  it('maps drop targets to destinations', () => {
    expect(destinationOf({ type: 'root' })).toEqual({ type: 'root' })
    expect(destinationOf({ type: 'note', id: 'n' })).toEqual({ type: 'note', id: 'n' })
  })

  it('reads a dragged node and rejects anything else', () => {
    expect(parseNode(JSON.stringify({ kind: 'note', id: 'n1' }))).toEqual({
      kind: 'note',
      id: 'n1',
    })
    for (const raw of [
      undefined,
      '',
      'nope',
      '[]',
      '{"kind":"file","id":"x"}',
      '{"kind":"note"}',
      'null',
    ]) {
      expect(parseNode(raw)).toBeNull()
    }
  })
})
