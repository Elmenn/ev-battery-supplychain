# Optional: Speed Up Dev Builds

If the first build is taking too long (>5 minutes), you can temporarily disable source maps:

## Quick Fix (Temporary)

Edit `config-overrides.js` line 68:
```javascript
// Fast build (no source maps)
config.devtool = false;

// OR keep source maps but make them faster
// config.devtool = 'eval'; // Fastest source maps
```

## Why First Build is Slow

1. **Large SDK Bundles:** Railgun SDK includes:
   - Large cryptographic libraries
   - ZK proof artifacts
   - Multiple engine modules
   - This is **normal** - SDKs are big

2. **Webpack Analysis:** After adding `overrides`, webpack:
   - Re-resolves all dependencies
   - Analyzes chunk dependencies for singleton enforcement
   - Creates source maps

3. **First-Time Cache:** Webpack cache is empty - subsequent builds use cache

## Recommendation

**Keep waiting** - The first build is one-time. After it completes:
- Subsequent builds will be **much faster** (10-30 seconds)
- Hot reload will work normally
- You only pay this cost once

If it's been >10 minutes, then consider disabling source maps temporarily.







