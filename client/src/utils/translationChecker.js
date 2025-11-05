import i18next from 'i18next';

export const checkMissingTranslations = () => {
  const languages = ['en', 'de', 'fr']; // Add all your supported languages
  const namespaces = ['common', 'header']; // Add all your namespaces

  languages.forEach(lang => {
    namespaces.forEach(ns => {
      const translations = i18next.getResourceBundle(lang, ns);
      console.log(`Checking ${lang} ${ns}:`);
      Object.keys(translations).forEach(key => {
        if (!translations[key]) {
          console.warn(`Missing translation for ${lang} ${ns}:${key}`);
        }
      });
    });
  });
};