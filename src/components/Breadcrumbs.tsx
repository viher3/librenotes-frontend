import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { PathItem } from '@/data/types'

const hrefOf = (item: PathItem) =>
  item.type === 'folder' ? `/folder/${item.id}` : `/doc/${item.id}`

/** Where the current item sits: the top level, its folders and documents, then the item itself. */
export function Breadcrumbs({ path, current }: { path: PathItem[]; current: string }) {
  const { t } = useTranslation('tree')
  return (
    <nav
      aria-label={t('breadcrumb.label')}
      className="text-sm text-neutral-600 dark:text-neutral-400"
    >
      <ol className="flex flex-wrap items-center gap-x-1">
        <li>
          <Link to="/" className="hover:underline">
            {t('breadcrumb.home')}
          </Link>
        </li>
        {path.map((item) => (
          <li key={`${item.type}:${item.id}`} className="flex items-center gap-x-1">
            <span aria-hidden="true">›</span>
            <Link to={hrefOf(item)} className="max-w-[16ch] truncate hover:underline">
              {item.title}
            </Link>
          </li>
        ))}
        <li className="flex items-center gap-x-1" aria-current="page">
          <span aria-hidden="true">›</span>
          <span className="max-w-[24ch] truncate font-medium text-neutral-800 dark:text-neutral-200">
            {current}
          </span>
        </li>
      </ol>
    </nav>
  )
}
