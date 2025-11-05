import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      manageSessions: "Manage Sessions",
      availability: "Availability",
      oneOnOneSessions: "One-on-One Sessions",
      groupClasses: "Group Classes",
      addNew: "Add New",
      // Add more translations
    }
  },
  // Add more languages
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: "en",
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;