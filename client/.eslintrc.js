module.exports = {
  extends: [
    'react-app',
    'plugin:react/recommended',
    'plugin:i18next/recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  plugins: ['react', 'i18next', '@typescript-eslint'],
  parser: '@typescript-eslint/parser',
  rules: {
    'i18next/no-literal-string': [
      'warn',
      {
        markupOnly: true,
        ignoreAttribute: ['data-testid', 'to', 'href', 'src', 'alt']
      }
    ],
    'react/prop-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn'
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        'react/prop-types': 'off',
      },
    },
  ],
  settings: {
    react: {
      version: 'detect'
    }
  }
};