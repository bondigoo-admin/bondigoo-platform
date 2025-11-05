const i18next = require('i18next');
const FsBackend = require('i18next-fs-backend');
const path = require('path');

const loadPath = path.join(__dirname, '../../src/locales/{{lng}}/{{ns}}.json');
//console.log(`[i18next] FsBackend attempting to load translations from: ${loadPath.replace('{{lng}}/{{ns}}.json', '')}`);

const i18nextOptions = {
  debug: false,
  fallbackLng: 'en',
  preload: ['en', 'de', 'fr'],
  ns: [
      'common', 'header', 'signup', 'coachprofile', 'managesessions', 
      'availabilitystatus', 'notification', 'notifications', 'manageAvailability', 
      'settings', 'availability', 'payments', 'coachList', 'workshops', 
      'review', 'messaging', 'userprofile', 'programs', 'admin', 
      'bookings', 'coach_dashboard', 'home', 'liveSession', 'search'
  ], 
  defaultNS: 'common',
  backend: {
    loadPath: loadPath,
  },
  initImmediate: false, 
};

const initializeI18next = () => i18next.use(FsBackend).init(i18nextOptions);

module.exports = { i18next, initializeI18next };