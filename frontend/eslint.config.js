import globals from 'globals';
import react from 'eslint-plugin-react';
import unusedImports from 'eslint-plugin-unused-imports';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.mjs', 'tests/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, 'unused-imports': unusedImports },
    rules: {
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-key': 'error',
      'unused-imports/no-unused-imports': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
