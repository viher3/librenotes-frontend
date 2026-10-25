import { useRef, useState, type DragEvent } from 'react'

const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

/**
 * Turns an element into a drop target for files (and only files: dragging text around the editor is left alone).
 * The capture handler takes the drop before CodeMirror, which would otherwise read the file into the document.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  const finish = () => {
    depth.current = 0
    setDragging(false)
  }

  return {
    dragging,
    dropProps: {
      onDragEnter: (event: DragEvent) => {
        if (!hasFiles(event)) return
        depth.current += 1
        setDragging(true)
      },
      onDragOver: (event: DragEvent) => {
        if (!hasFiles(event)) return
        event.preventDefault() // required for the element to accept the drop
        event.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: (event: DragEvent) => {
        if (!hasFiles(event)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      },
      onDropCapture: (event: DragEvent) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        event.stopPropagation()
        finish()
        const files = Array.from(event.dataTransfer.files)
        if (files.length > 0) onFiles(files)
      },
    },
  }
}
