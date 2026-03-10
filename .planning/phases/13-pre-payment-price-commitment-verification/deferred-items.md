# Deferred Items — Phase 13

## Pre-existing Build Issue (out of scope)

**Discovered during:** 13-01 Task 2 verification
**Issue:** `Module not found: Error: Can't resolve 'crypto'` in `@railgun-community/engine/dist/utils`
**Root cause:** webpack < 5 removed Node.js core module polyfills; `crypto-browserify` not configured
**Impact:** `react-scripts build` fails, but development server (`react-scripts start`) is unaffected
**Action required:** Add `resolve.fallback: { "crypto": require.resolve("crypto-browserify") }` to webpack config (via react-app-rewired or craco), or eject
**Note:** This was present BEFORE phase 13 work — not introduced by 13-01 changes
