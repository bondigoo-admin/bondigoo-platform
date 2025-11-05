const fs = require('fs');
const path = require('path');
const glob = require('glob');

const extractTranslations = () => {
  const files = glob.sync('src/**/*.{js,jsx}');
  const translations = {};

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/t\(['"]([^'"]+)['"]/g);
    
    if (matches) {
      matches.forEach(match => {
        const key = match.replace(/t\(['"]/, '').replace(/['"]/, '');
        const [namespace, translationKey] = key.split(':');
        
        if (!translations[namespace]) {
          translations[namespace] = {};
        }
        
        translations[namespace][translationKey] = '';
      });
    }
  });

  Object.keys(translations).forEach(namespace => {
    const filePath = path.join(__dirname, '..', 'src', 'locales', 'en', `${namespace}.json`);
    let existingTranslations = {};
    
    if (fs.existsSync(filePath)) {
      existingTranslations = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    const mergedTranslations = { ...existingTranslations, ...translations[namespace] };
    
    fs.writeFileSync(filePath, JSON.stringify(mergedTranslations, null, 2));
  });
};

extractTranslations();