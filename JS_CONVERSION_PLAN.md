# JavaScript Conversion Plan

## Issue
All Railgun initialization files were created as `.ts` (TypeScript) but the project uses `.js` (JavaScript). This causes "Cannot use import statement outside a module" errors.

## Solution
Convert all `.ts` files to `.js` files by:
1. Removing TypeScript type annotations (`: string`, `: Promise<void>`, etc.)
2. Removing interface declarations (or converting to JSDoc)
3. Removing `as` type assertions
4. Updating all imports to reference `.js` files

## Files to Convert
- [x] railgun-config.ts → railgun-config.js (DONE)
- [ ] railgun-init.ts → railgun-init.js
- [ ] railgun-providers.ts → railgun-providers.js
- [ ] railgun-database.ts → railgun-database.js
- [ ] railgun-artifacts.ts → railgun-artifacts.js
- [ ] railgun-prover.ts → railgun-prover.js
- [ ] railgun-logger.ts → railgun-logger.js
- [ ] railgun-engine-providers.ts → railgun-engine-providers.js
- [ ] railgun-waku.ts → railgun-waku.js
- [ ] railgun-wallet.ts → railgun-wallet.js
- [ ] railgun-balances.ts → railgun-balances.js
- [ ] railgun-shield.ts → railgun-shield.js
- [ ] railgun-transfer.ts → railgun-transfer.js
- [ ] railgun-unshield.ts → railgun-unshield.js
- [ ] railgun-initialization-test.ts → railgun-initialization-test.js
- [ ] index.ts → index.js

## Note
This is a large conversion. After conversion, all `.ts` files should be deleted to avoid confusion.

