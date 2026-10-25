import { imageSchema } from '@milkdown/kit/preset/commonmark'
import { $view } from '@milkdown/kit/utils'

const ATTACHMENT = /^attachment:([\w-]{1,64})$/

/**
 * How images are drawn. `attachment:ID` points at a file on the app's own backend: it needs the session, so the
 * bytes are loaded through `load` and shown from an object URL (the raw address is never requested). Everything
 * else is a plain image that does not tell the remote server which document is being edited.
 */
export const attachmentImageView = (load: (id: string) => Promise<Blob>) =>
  $view(imageSchema.node, () => (initial) => {
    const img = document.createElement('img')
    img.draggable = true
    let objectUrl: string | null = null
    let current = ''
    let generation = 0

    const release = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }

    const show = (src: string, alt: string, title: string) => {
      img.alt = alt
      if (title) img.title = title
      else img.removeAttribute('title')
      if (src === current) return
      current = src
      generation += 1
      const mine = generation
      release()
      img.removeAttribute('src')
      const attachment = ATTACHMENT.exec(src)
      if (!attachment) {
        img.dataset.state = 'ready'
        img.referrerPolicy = 'no-referrer'
        img.loading = 'lazy'
        img.src = src
        return
      }
      img.dataset.state = 'loading'
      load(attachment[1]).then(
        (blob) => {
          if (mine !== generation) return
          objectUrl = URL.createObjectURL(blob)
          img.dataset.state = 'ready'
          img.src = objectUrl
        },
        () => {
          if (mine === generation) img.dataset.state = 'error'
        },
      )
    }

    show(
      String(initial.attrs.src ?? ''),
      String(initial.attrs.alt ?? ''),
      String(initial.attrs.title ?? ''),
    )

    return {
      dom: img,
      update(node) {
        if (node.type !== initial.type) return false
        show(
          String(node.attrs.src ?? ''),
          String(node.attrs.alt ?? ''),
          String(node.attrs.title ?? ''),
        )
        return true
      },
      destroy() {
        generation += 1
        release()
      },
    }
  })
