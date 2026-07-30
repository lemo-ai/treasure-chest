import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { AppLocale } from '@shared'
import zh from '../../locales/zh-CN/common.json'
import en from '../../locales/en-US/common.json'

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { common: zh },
    'en-US': { common: en },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export async function setAppLocale(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale)
}

export default i18n
