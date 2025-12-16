# Starting Ganache for Tests

To run tests locally, start Ganache in a separate terminal:

## Quick Start

```bash
ganache --port 8545 --accounts 10 --defaultBalanceEther 100
```

This will:
- Start Ganache on port 8545 (matches truffle-config.js)
- Create 10 test accounts
- Each account starts with 100 ETH

## Recommended Settings for Testing

```bash
ganache --port 8545 --accounts 10 --defaultBalanceEther 1000 --gasLimit 12000000 --deterministic
```

Options:
- `--deterministic`: Use deterministic accounts (same addresses every time)
- `--gasLimit 12000000`: Set gas limit for complex contracts
- `--defaultBalanceEther 1000`: Give each account 1000 ETH

## Then Run Tests

In another terminal:
```bash
npx truffle test test/PhaseMachine.test.js --network development
```

## Alternative: Use Sepolia (NOT recommended for tests)

If you want to use Sepolia (slow, costs gas), run:
```bash
npx truffle test test/PhaseMachine.test.js --network sepolia
```

⚠️ **Warning**: Tests on Sepolia will:
- Take much longer (block time ~12s)
- Cost gas for each transaction
- May fail due to network delays
- Not recommended for development/testing

## Why Ganache?

Ganache is a local blockchain that:
- ✅ Runs instantly (no network latency)
- ✅ Free (no gas costs)
- ✅ Fast (millisecond block times)
- ✅ Deterministic (same results every run)
- ✅ Allows time manipulation (`evm_increaseTime`)

Perfect for tests, especially evaluation tests that need to run 100+ times!

