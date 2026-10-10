import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import enAttachments from '@/locales/en/attachments.json'
import enAuth from '@/locales/en/auth.json'
import enCommon from '@/locales/en/common.json'
import enDocuments from '@/locales/en/documents.json'
import enErrors from '@/locales/en/errors.json'
import enLinks from '@/locales/en/links.json'
import enSearch from '@/locales/en/search.json'
import enTrash from '@/locales/en/trash.json'
import enTags from '@/locales/en/tags.json'
import enTree from '@/locales/en/tree.json'
import esAttachments from '@/locales/es/attachments.json'
import esAuth from '@/locales/es/auth.json'
import esCommon from '@/locales/es/common.json'
import esDocuments from '@/locales/es/documents.json'
import esErrors from '@/locales/es/errors.json'
import esLinks from '@/locales/es/links.json'
import esSearch from '@/locales/es/search.json'
import esTrash from '@/locales/es/trash.json'
import esTags from '@/locales/es/tags.json'
import esTree from '@/locales/es/tree.json'

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const resources = {
  es: {
    common: esCommon,
    attachments: esAttachments,
    auth: esAuth,
    documents: esDocuments,
    errors: esErrors,
    links: esLinks,
    search: esSearch,
    tags: esTags,
    trash: esTrash,
    tree: esTree,
  },
  en: {
    common: enCommon,
    attachments: enAttachments,
    auth: enAuth,
    documents: enDocuments,
    errors: enErrors,
    links: enLinks,
    search: enSearch,
    tags: enTags,
    trash: enTrash,
    tree: enTree,
  },
} as const

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true,
    defaultNS: 'common',
    ns: [
      'common',
      'attachments',
      'auth',
      'documents',
      'errors',
      'links',
      'search',
      'tags',
      'trash',
      'tree',
    ],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'librenotes.lang',
      caches: ['localStorage'],
    },
  })

const syncHtmlLang = (lng: string) => {
  document.documentElement.lang = lng.split('-')[0]
}
syncHtmlLang(i18n.language)
i18n.on('languageChanged', syncHtmlLang)

export default i18n
