# Coding Conventions

**Analysis Date:** 2026-01-20

## Naming Patterns

**Files:**
- React components: PascalCase with `.jsx` or `.js` extension (`ProductCard.jsx`, `VCViewer.jsx`)
- Utility modules: camelCase with `.js` or `.mjs` extension (`errorHandler.js`, `vcBuilder.mjs`)
- Test files: `{name}.test.js` pattern (`ProductCreation.test.js`, `commitmentUtils.test.js`)
- Smart contracts: PascalCase with `_` for variants (`ProductEscrow_Initializer.sol`)

**Functions:**
- camelCase for all functions (`extractErrorMessage`, `generateBindingTag`, `buildStage2VC`)
- Async functions often prefixed with action verb (`handleDelivery`, `fetchVC`, `verifyVC`)
- React handlers prefixed with `handle` or `on` (`handleDelivery`, `onConfirmDelivery`)
- Boolean getters prefixed with `is`/`has`/`can` (`isRecoverableError`, `hasBuyer`)

**Variables:**
- camelCase for variables and state (`productAddress`, `vcDraft`, `priceCommitment`)
- UPPER_SNAKE_CASE for constants (`CHAIN_ID`, `ESCROW_ABI`, `ZERO`, `VERBOSE`)
- State hooks use `[value, setValue]` pattern (`[loading, setLoading]`)

**Types/Interfaces:**
- Not applicable - project uses JavaScript, not TypeScript (except `RailgunSimple.tsx`)

## Code Style

**Formatting:**
- Indentation: 2 spaces
- No configured Prettier/ESLint at project root (some may exist in subdirectories)
- Strings: Double quotes preferred in most files

**Linting:**
- ESLint v9.7.0 in `backend/api/package.json`
- No project-wide `.eslintrc` configuration detected
- Create React App includes built-in ESLint

## Import Organization

**Order (observed pattern):**
1. React and React-related imports (`React`, `useState`, `useEffect`, `useParams`)
2. Third-party libraries (`ethers`, `axios`, `react-hot-toast`, `lucide-react`)
3. Internal components (relative paths `./components/...`, `../components/...`)
4. Utilities (`../../utils/web3Utils`, `../../utils/commitmentUtils`)
5. ABI/JSON files (`../../abis/ProductEscrow_Initializer.json`)
6. CSS files (`./App.css`)

**Path Aliases:**
- No path aliases configured - all imports use relative paths
- Common patterns: `../../utils/`, `../components/`, `./abis/`

**Example from `frontend/src/components/marketplace/ProductDetail.jsx`:**
```javascript
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { ethers } from "ethers";
import { getCurrentCid, confirmOrder } from "../../utils/web3Utils";
import { uploadJson } from "../../utils/ipfs";
import { buildStage2VC, buildStage3VC, freezeVcJson } from "../../utils/vcBuilder.mjs";
import toast from 'react-hot-toast';
import ProductEscrowABI from "../../abis/ProductEscrow_Initializer.json";
```

## Error Handling

**Patterns:**
- Try-catch blocks with console.error for logging
- User-facing errors use `toast.error()` or `alert()`
- Error extraction utility in `frontend/src/utils/errorHandler.js`

**Error Handler Utility Pattern:**
```javascript
// frontend/src/utils/errorHandler.js
export function extractErrorMessage(error) {
  if (!error) return "An unknown error occurred";
  if (error.reason) return error.reason;
  if (error.message) {
    const message = error.message.toLowerCase();
    if (message.includes('user rejected')) return "Transaction was cancelled by user";
    if (message.includes('insufficient funds')) return "Insufficient funds";
    // ... pattern matching for common errors
  }
  return "An unknown error occurred - please try again";
}
```

**Async Error Handling:**
```javascript
try {
  const tx = await contract.someMethod();
  await tx.wait();
} catch (err) {
  console.error("Operation failed:", err);
  toast.error("Operation failed: " + extractErrorMessage(err));
}
```

**Smart Contract Error Handling:**
- `truffleAssert.reverts()` for expected failures
- Custom error extraction from revert messages

## Logging

**Framework:** Console (no external logging framework)

**Patterns:**
- Debug with emoji prefixes: `console.log("✅ Product created")`
- Error logging: `console.error("❌ Operation failed:", error)`
- Warning: `console.warn("⚠️ Fallback activated")`
- Flow logging with brackets: `console.log('[Flow][Buyer] Step 4 → ...')`

**Verbose Flag Pattern:**
```javascript
const VERBOSE = false; // Set to true only when debugging
if (VERBOSE) console.log("Debug details:", data);
```

**Custom Logger (minimal):**
```javascript
// frontend/src/utils/logger.js
let log = null;
let error = null;

export const sendMessage = (msg) => { if (log) log(msg); };
export const sendErrorMessage = (err) => { if (error) error(err); };
export const setLoggers = (logFunc, errorFunc) => { log = logFunc; error = errorFunc; };
```

## Comments

**When to Comment:**
- Section headers with dashes: `/* ─────────────── State ────────────────────────────────────── */`
- Complex business logic explanations
- TODO/FIXME markers for technical debt
- Feature flags: `// Feature 2: Include binding tag`

**JSDoc/TSDoc:**
- Full JSDoc for utility functions in `commitmentUtils.js`:
```javascript
/**
 * Generate binding tag for ZKP proof
 * Binds proof to VC context to prevent replay attacks
 *
 * @param {string|number} chainId - Chain ID
 * @param {string} escrowAddr - Product escrow contract address
 * @param {string|number|bigint} productId - Product ID from contract
 * @returns {string} - 32-byte hex string (64 hex chars)
 */
export function generateBindingTag({ chainId, escrowAddr, productId, stage, schemaVersion }) {
```

## Function Design

**Size:**
- Most functions under 50 lines
- Larger components split into smaller helper functions
- Complex flows broken into numbered steps

**Parameters:**
- Destructuring for multiple parameters: `function generateBindingTag({ chainId, escrowAddr, productId })`
- Default values: `zkpBackendUrl = 'http://localhost:5010'`
- Optional parameters last or with defaults

**Return Values:**
- Objects for multiple return values: `{ commitment, proof, verified, bindingTag }`
- Boolean for verification functions: `verifyCommitmentMatch() -> boolean`
- Null for not-found cases with explicit checks

## Module Design

**Exports:**
- Named exports preferred over default exports for utilities
- Default export for React components
- Mixed pattern in some files

**Example - Named Exports:**
```javascript
// frontend/src/utils/commitmentUtils.js
export function generateDeterministicBlinding() { ... }
export function generateBindingTag() { ... }
export async function generateCommitmentWithBindingTag() { ... }
```

**Example - Default Export:**
```javascript
// frontend/src/components/marketplace/ProductCard.jsx
const ProductCard = ({ product, myAddress }) => { ... };
export default ProductCard;
```

**Barrel Files:**
- Limited use of barrel files
- `frontend/src/components/railgun/index.js` exports multiple components

## React Component Patterns

**Functional Components Only:**
- All components use functional components with hooks
- No class components observed

**State Management:**
- Local state with `useState`
- Side effects with `useEffect`
- Memoization with `useCallback`, `useRef`
- No global state library (Redux/Zustand) detected

**Props Pattern:**
```javascript
const ProductCard = ({ product, myAddress, provider, onPurchased }) => {
  // Destructure props in function signature
};
```

**Hook Order:**
1. useParams/router hooks
2. useState declarations
3. useRef declarations
4. useCallback definitions
5. useEffect for side effects

## Smart Contract Conventions

**Solidity Style:**
- OpenZeppelin contracts for security patterns
- Truffle Assertions for testing
- Event emission for state changes

**Test Pattern for Contracts:**
```javascript
contract("Test Name", (accounts) => {
  const [owner, seller, buyer] = accounts;
  let factory, escrow;

  beforeEach(async () => {
    // Setup
  });

  describe("Feature", () => {
    it("should do something", async () => {
      // Arrange, Act, Assert
    });
  });
});
```

## Constants and Configuration

**Environment Variables:**
- Prefixed with `REACT_APP_` for frontend
- Loaded via `process.env`
- Fallback values provided inline

**Pattern:**
```javascript
const CHAIN_ID = process.env.REACT_APP_CHAIN_ID || "1337";
const ZKP_BACKEND = process.env.REACT_APP_ZKP_BACKEND_URL || 'http://localhost:5010';
```

**Magic Values:**
```javascript
const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO_COMMITMENT = "0x0000000000000000000000000000000000000000000000000000000000000000";
```

---

*Convention analysis: 2026-01-20*
