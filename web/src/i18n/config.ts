import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import enTranslations from '../locales/en/translation.json';
import zhTranslations from '../locales/zh/translation.json';

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            zh: {
                translation: zhTranslations
            },
            en: {
                translation: enTranslations
            }
        },
        fallbackLng: 'zh',
        lng: localStorage.getItem('i18nextLng') || 'zh',
        interpolation: {
            escapeValue: false
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage']
        }
    });

export default i18n;
