# Testing Patterns

**Analysis Date:** 2026-01-20

## Test Framework

**Smart Contract Tests (Truffle):**
- Framework: Truffle Test (Mocha-based)
- Assertion Libraries: Chai, truffle-assertions
- Location: `test/*.test.js`
- Config: `truffle-config.js` (not found in root, likely in standard location)

**Frontend Tests (Jest/React Testing Library):**
- Framework: Jest (via Create React App)
- Assertion Library: @testing-library/jest-dom
- Config: Built into react-scripts
- Location: `frontend/src/**/__tests__/*.test.js`

**Run Commands:**
```bash
# Smart contract tests (from root)
truffle test

# Specific test file
truffle test test/ProductCreation.test.js

# Frontend tests (from frontend/)
npm test                    # Watch mode
npm test -- --coverage      # Coverage report
```

## Test File Organization

**Location:**
- Smart contract tests: `test/*.test.js` (separate directory)
- Frontend unit tests: `frontend/src/utils/__tests__/*.test.js` (co-located)
- Frontend component tests: `frontend/src/App.test.js` (co-located)

**Naming:**
- Smart contracts: `{FeatureName}.test.js` (e.g., `AccessControl.test.js`, `Reentrancy.test.js`)
- Frontend utils: `{moduleName}.test.js` (e.g., `commitmentUtils.test.js`)

**Directory Structure:**
```
test/
├── fixtures/
│   ├── sample-vc-s0.json
│   ├── sample-vc-s1.json
│   └── sample-vc-s2.json
├── ProductCreation.test.js
├── AccessControl.test.js
├── EndToEndFlow.test.js
├── Reentrancy.test.js
├── GasMeasurement.test.js
└── ... (24 test files total)

frontend/src/
├── App.test.js
├── setupTests.js
└── utils/__tests__/
    ├── canonicalSigning.test.js
    ├── commitmentUtils.test.js
    └── deliveryTxHashCommitment.test.js
```

## Test Structure

**Smart Contract Test Suite Organization:**
```javascript
// test/AccessControl.test.js
const ProductEscrow_Initializer = artifacts.require("ProductEscrow_Initializer");
const ProductFactory = artifacts.require("ProductFactory");
const truffleAssert = require("truffle-assertions");

contract("Access Control", (accounts) => {
    let factory, implementation;
    const [owner, nonOwner, seller] = accounts;

    beforeEach(async () => {
        // Deploy fresh contracts for each test
        implementation = await ProductEscrow_Initializer.new();
        factory = await ProductFactory.new(implementation.address);
    });

    describe("Factory Ownership", () => {
        it("should set correct owner on deployment", async () => {
            const factoryOwner = await factory.owner();
            assert.equal(factoryOwner, owner);
        });

        it("should only allow owner to pause", async () => {
            await factory.pause({ from: owner });
            assert.isTrue(await factory.isPaused());

            await truffleAssert.reverts(
                factory.pause({ from: nonOwner })
            );
        });
    });
});
```

**Frontend Test Suite Organization (Jest):**
```javascript
// frontend/src/utils/__tests__/commitmentUtils.test.js
import { generateBindingTag, generateDeterministicBlinding } from '../commitmentUtils';

describe('generateBindingTag', () => {
  const testContext = {
    chainId: 11155111,
    escrowAddr: '0x1234567890123456789012345678901234567890',
    productId: 1,
    stage: 0,
    schemaVersion: '1.0',
  };

  it('should generate a binding tag with required parameters', () => {
    const bindingTag = generateBindingTag(testContext);

    expect(bindingTag).toBeDefined();
    expect(typeof bindingTag).toBe('string');
    expect(bindingTag.length).toBe(64);
  });

  it('should throw error for missing required parameters', () => {
    expect(() => generateBindingTag({})).toThrow();
  });
});
```

**Patterns:**
- `beforeEach` for fresh contract deployment per test (isolation)
- `describe` blocks for grouping related tests
- `it` blocks with descriptive names starting with "should"
- Console logging with emojis for test progress visibility

## Mocking

**Framework:**
- Smart contracts: No mocking framework (uses real contract deployment on Ganache)
- Frontend: Jest built-in mocking

**Smart Contract Mocking Pattern (using helper contracts):**
```javascript
// test/Reentrancy.test.js
const MaliciousReentrant = artifacts.require("helpers/MaliciousReentrant");

beforeEach(async () => {
    maliciousContract = await MaliciousReentrant.new(escrow.address);
});

it("should prevent reentrancy attack", async () => {
    await truffleAssert.reverts(
        maliciousContract.attackWithdrawBid({ from: attacker })
    );
});
```

**Frontend Mocking Pattern:**
```javascript
// frontend/src/utils/__tests__/canonicalSigning.test.js
const mockSigner = {
  getAddress: async () => '0x1234567890123456789012345678901234567890',
  signTypedData: async (domain, types, payload) => {
    return '0x' + 'a'.repeat(130); // Mock signature
  },
  provider: {
    getNetwork: async () => ({ chainId: 11155111n }),
  },
};

test('should sign VC with mock signer', async () => {
  const proof = await signVcWithMetamask(mockVC, mockSigner);
  expect(proof).toBeDefined();
});
```

**What to Mock:**
- External wallet signers (MetaMask)
- Network providers
- API endpoints (ZKP backend, IPFS)
- Time-dependent operations (use `evm_increaseTime`)

**What NOT to Mock:**
- Smart contract logic (test against real contracts on Ganache)
- Cryptographic functions (test actual outputs)
- EIP-712 signing logic (verify actual signatures)

## Fixtures and Factories

**Test Data:**
- JSON fixtures in `test/fixtures/` for VC samples
- Inline test data for simple cases
- Helper functions for complex data generation

**Fixture Pattern:**
```javascript
// test/fixtures/sample-vc-s0.json - Stage 0 VC
// test/fixtures/sample-vc-s1.json - Stage 1 VC
// test/fixtures/sample-vc-s2.json - Stage 2 VC
```

**Factory Functions in Tests:**
```javascript
// test/EndToEndFlow.test.js
function buildStage0VC(productName) {
  return {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    id: `https://example.edu/credentials/${crypto.randomBytes(16).toString("hex")}`,
    type: ["VerifiableCredential"],
    schemaVersion: SCHEMA_VERSION,
    issuer: {
      id: `did:ethr:${CHAIN_ID}:${SELLER_WALLET.address.toLowerCase()}`,
      name: "Seller",
    },
    // ... rest of VC structure
  };
}

function buildStage1VC(stage0, stage0Cid, priceZkpProof, purchaseTxHashCommitment) {
  return {
    ...stage0,
    credentialSubject: {
      ...stage0.credentialSubject,
      previousCredential: stage0Cid,
      price: JSON.stringify({ hidden: true, zkpProof: priceZkpProof }),
    },
  };
}
```

**Location:**
- Fixtures: `test/fixtures/`
- Factory functions: Inline in test files or extracted to helper modules

## Coverage

**Requirements:** No explicit coverage thresholds enforced

**View Coverage (Frontend):**
```bash
cd frontend && npm test -- --coverage
```

**Coverage not configured for:**
- Truffle smart contract tests (separate tool needed like solidity-coverage)

## Test Types

**Unit Tests:**
- Location: `frontend/src/utils/__tests__/`
- Focus: Individual utility functions (commitmentUtils, signVcWithMetamask)
- Pattern: Test inputs/outputs, edge cases, error handling

**Integration Tests:**
- Location: `test/*.test.js`
- Focus: Contract interactions, multi-step flows
- Examples: `EndToEndFlow.test.js`, `TransactionVerification.test.js`

**Security Tests:**
- Location: `test/Reentrancy.test.js`, `test/SecurityReplaySwap.test.js`, `test/SecurityVCIntegrity.test.js`
- Focus: Attack vectors, access control, reentrancy protection

**Performance Tests:**
- Location: `test/GasMeasurement.test.js`, `test/StorageMeasurement.test.js`
- Focus: Gas usage statistics, storage costs

**E2E Tests:**
- Framework: Not configured (no Cypress/Playwright detected)
- Manual: `test/EndToEndFlow.test.js` tests full product lifecycle

## Common Patterns

**Async Testing (Smart Contracts):**
```javascript
it("should create product and emit event", async () => {
  const tx = await factory.createProduct("Test Battery", commitment, { from: seller });

  const event = tx.logs.find(log => log.event === "ProductCreated");
  assert.ok(event, "ProductCreated event should be emitted");
  assert.equal(event.args.seller, seller);
});
```

**Async Testing (Frontend - Jest):**
```javascript
test('should handle async operation', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

**Error Testing (Smart Contracts):**
```javascript
it("should revert on unauthorized access", async () => {
  await truffleAssert.reverts(
    factory.pause({ from: nonOwner }),
    // Optional: expected revert reason
  );
});
```

**Error Testing (Frontend - Jest):**
```javascript
it('should throw error for invalid input', () => {
  expect(() => generateBindingTag({})).toThrow();
  expect(() => generateBindingTag({ chainId: 11155111 })).toThrow();
});
```

**Time Manipulation (Smart Contracts):**
```javascript
async function skip(seconds) {
  await new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: "2.0",
      method: "evm_increaseTime",
      params: [seconds],
      id: new Date().getTime(),
    }, (err1) => {
      if (err1) return reject(err1);
      web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [],
        id: new Date().getTime() + 1,
      }, (err2, res) => (err2 ? reject(err2) : resolve(res)));
    });
  });
}

// Usage
await skip(60 * 60 * 24 * 2); // Skip 2 days
```

**Statistical Analysis (Performance Tests):**
```javascript
function calculateStats(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { mean, min, max, stdDev };
}

it("should measure gas usage", async () => {
  const gasUsed = [];
  for (let i = 0; i < 10; i++) {
    const tx = await contract.someMethod();
    gasUsed.push(tx.receipt.gasUsed);
  }
  const stats = calculateStats(gasUsed);
  console.log("Gas Statistics:", stats);
});
```

## Test Categories

| Category | Files | Purpose |
|----------|-------|---------|
| Product Lifecycle | `ProductCreation.test.js`, `SimpleProductEscrow.test.js` | Basic CRUD operations |
| Security | `Reentrancy.test.js`, `AccessControl.test.js`, `SecurityReplaySwap.test.js` | Attack prevention |
| ZKP/Cryptography | `TxHashCommitment.test.js`, `LinkableCommitment.test.js` | Commitment schemes |
| VC Verification | `AuditorVerification.test.js`, `TransactionVerification.test.js` | Credential validation |
| Performance | `GasMeasurement.test.js`, `StorageMeasurement.test.js`, `FactoryPatternSavings.test.js` | Gas/storage metrics |
| End-to-End | `EndToEndFlow.test.js` | Full workflow |
| Frontend Utils | `commitmentUtils.test.js`, `canonicalSigning.test.js` | Utility function tests |

## Setup Files

**Frontend Setup:**
```javascript
// frontend/src/setupTests.js
import '@testing-library/jest-dom';
```

**Smart Contract Setup:**
- Uses Truffle migrations in `migrations/`
- Ganache for local blockchain
- No separate test setup file (setup done in `beforeEach`)

## External Dependencies for Testing

**Smart Contract Tests:**
- `truffle-assertions@0.9.2` - Revert assertions
- `chai@4.5.0` - Assertion library
- `axios@1.6.0` - HTTP client for ZKP backend calls
- `ethers@6.14.4` - Ethereum interactions

**Frontend Tests:**
- `@testing-library/jest-dom@5.17.0` - DOM matchers
- `@testing-library/react@13.4.0` - React component testing
- `@testing-library/user-event@13.5.0` - User interaction simulation

---

*Testing analysis: 2026-01-20*
