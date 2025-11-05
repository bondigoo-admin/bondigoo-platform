module.exports = {
  input: ['src/components/**/*.js'],
  output: 'src/locales/$LOCALE/$NAMESPACE.json',
  defaultNamespace: 'common',
  defaultLanguage: 'en',
  locales: ['en', 'de', 'fr'],
  namespaceSeparator: ':',
  keySeparator: '.',
  options: {
    trans: 't', // Change this from 'translate' to 't'
  },
  defaultNamespace: 'common',
  fileTypes: {
    js: {
      pattern: /t\(['"`](.*?)['"`]\)/g, // Update this pattern to match t() calls
      getKey: match => match[1],
    },
  },
};
