import '@testing-library/jest-dom/vitest'

import { afterEach } from 'vitest'

// Browser storage is shared by the whole file: start every test from a clean slate.
afterEach(() => {
  localStorage.clear()
})

// jsdom does not lay anything out, and CodeMirror measures text with these Range methods.
const emptyRects = { length: 0, item: () => null, [Symbol.iterator]: function* () {} }
Range.prototype.getClientRects = () => emptyRects as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()

// ProseMirror asks the document which element is under a point; jsdom has no layout, so nothing is.
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null
  document.elementsFromPoint = () => []
}
