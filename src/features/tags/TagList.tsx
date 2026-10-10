import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { useTags } from './queries'

/** Every tag in use, with its count, as links to the page that lists what carries it. */
export function TagList() {
  const { t } = useTranslation('tags')
  const query = useTags()
  if (query.isError) return null // the rest of the app works without it; it shows again on the next refresh
  const tags = query.data ?? []

  return (
    <details open className="group/tags shrink-0">
      <summary className="cursor-pointer text-xs font-semibold tracking-wide text-neutral-600 dark:text-neutral-400 uppercase select-none">
        {t('title')}
      </summary>
      {query.isSuccess && tags.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{t('list.empty')}</p>
      ) : (
        <ul aria-label={t('title')} className="mt-1 flex max-h-36 flex-col gap-0.5 overflow-y-auto">
          {tags.map(({ name, count }) => (
            <li key={name}>
              <NavLink
                to={`/tag/${encodeURIComponent(name)}`}
                aria-label={`${name} (${t('list.itemCount', { count })})`}
                className={({ isActive }) =>
                  `flex items-center justify-between gap-2 rounded px-2 py-0.5 text-sm ${
                    isActive
                      ? 'bg-neutral-200 font-medium dark:bg-neutral-800'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-900'
                  }`
                }
              >
                <span className="truncate">{name}</span>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">{count}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
