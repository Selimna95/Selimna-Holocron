import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'python/**', 'assets/**'] },
  {
    files: ['modules/**/*.js', 'interface-adapter.js', 'gac-usage.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.browser },
    rules: {
      'no-undef': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['warn', { selector: "AssignmentExpression[left.property.name='innerHTML']", message: 'Préférer createElement/textContent ; si un gabarit HTML est indispensable, échapper chaque donnée non fiable.' }],
    },
  },
  {
    files: ['modules/runtime-guards.js', 'optimizer-worker.mjs', 'vite.config.mjs', 'playwright.config.mjs', 'scripts/**/*.mjs', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.worker, ...globals.node },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-unreachable': 'error',
    },
  },
];
