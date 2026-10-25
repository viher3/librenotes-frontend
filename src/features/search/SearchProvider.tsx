import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SearchDialog } from './SearchDialog'

interface SearchApi {
  open: () => void
}

const SearchContext = createContext<SearchApi | null>(null)

export function useSearch(): SearchApi {
  const value = useContext(SearchContext)
  if (!value) throw new Error('useSearch must be used inside <SearchProvider>')
  return value
}

/** Makes the search dialog available everywhere in the signed-in area, and binds Ctrl/Cmd+K to it. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || event.altKey || event.shiftKey) return
      if (!(event.ctrlKey || event.metaKey)) return
      event.preventDefault() // browsers use Ctrl+K to focus their own search box
      setIsOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const api = useMemo(() => ({ open }), [open])

  return (
    <SearchContext.Provider value={api}>
      {children}
      {isOpen && <SearchDialog onClose={() => setIsOpen(false)} />}
    </SearchContext.Provider>
  )
}
