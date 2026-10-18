module.exports = [{
  ignores: ['node_modules/**', 'coverage/**', 'test-results/**', 'artifacts/**'],
}, {
  files: ['**/*.js', '**/*.cjs'],
  languageOptions: {
    ecmaVersion: 'latest', sourceType: 'commonjs',
    globals: { process: 'readonly', console: 'readonly', fetch: 'readonly', AbortSignal: 'readonly', URL: 'readonly', __dirname: 'readonly', __filename: 'readonly' },
  },
  rules: {
    'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-args': 'error',
    'no-dupe-keys': 'error', 'valid-typeof': 'error', 'constructor-super': 'error',
  },
}];
