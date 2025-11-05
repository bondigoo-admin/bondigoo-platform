import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

const missingKeyHandler = (lngs, ns, key, fallbackValue) => {
  //console.warn(`Missing translation: ${ns}:${key}`);
};

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    debug: true,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: true,
    },
    saveMissing: true,
    missingKeyHandler: missingKeyHandler,
    backend: {
      loadPath: '/src/locales/{{lng}}/{{ns}}.json',
      parse: (data) => data,
      ajax: (url, options, callback, data) => {
        // Force lowercase for namespace in URL
        const lowercaseUrl = url.replace(/\/([^/]+)\.json$/, (match, p1) => `/${p1.toLowerCase()}.json`);
        //console.log('Attempting to load:', lowercaseUrl);
        
        fetch(lowercaseUrl, options)
          .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
          })
          .then(data => callback(null, data))
          .catch(error => {
           // console.error('Error loading translation:', lowercaseUrl, error);
            callback(error, null);
          });
      }
    },
    ns: ['common', 'header', 'signup', 'coachprofile', 'managesessions', 'availabilitystatus', 'notification','notifications', 'manageAvailability', 'settings', 'availability', 'payments','coachList','workshops', 'review', 'messaging', 'onboarding' , 'termsOfService', 'communityGuidelines', 'privacyPolicy', "userprofile", 'footer', "programs", "userdashboard"],
    keySeparator: ".",
    defaultNS: 'common',
  }, (err, t) => {
    if (err) return console.error('i18n initialization error:', err);
   // console.log('i18n initialized successfully');
   // console.log('Available namespaces:', i18n.options.ns);
   // console.log('Loaded namespaces:', Object.keys(i18n.store.data[i18n.language] || {}));
  });

// Dynamically import all translation files
const importTranslations = (r) => {
  const namespaces = new Set();
  if (r && typeof r.keys === 'function') {
    r.keys().forEach((key) => {
      const match = key.match(/\.\/([^/]+)\/([^.]+)\.json$/);
      if (match) {
        const [, lang, ns] = match;
        //console.log(`Loading translation file: ${key}, Language: ${lang}, Namespace: ${ns}`);
        namespaces.add(ns);
        if (!i18n.hasResourceBundle(lang, ns)) {
          const translations = r(key);
          i18n.addResourceBundle(lang, ns, translations, true, true);
        }
      }
    });
  } else {
    //console.warn('Unable to import translations: Invalid context', r);
  }
  return Array.from(namespaces);
};

// Wrap the require.context call in a try-catch block
try {
  importTranslations(require.context('./locales', true, /\.json$/));
} catch (error) {
  //console.error('Error importing translations:', error);
}

export default i18n;