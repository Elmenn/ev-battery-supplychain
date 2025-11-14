module.exports = {
  extends: [
    'react-app',
    'react-app/jest'
  ],
  globals: {
    BigInt: 'readonly',
    Buffer: 'readonly'
  },
  rules: {
    'no-undef': 'error'
  },
  env: {
    es2020: true,
    browser: true,
    node: true
  }
}; 