// Build-time undefined-identifier gate (Task: community match page BASE_URL bug).
// Intentionally minimal: the ONLY job of this config is to fail the community
// build/deploy if any frontend file references an identifier that doesn't
// exist (like the `BASE_URL` typo that shipped a broken MatchDetail page).
// It is not a style linter — no formatting or stylistic rules belong here.
import globals from 'globals';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
