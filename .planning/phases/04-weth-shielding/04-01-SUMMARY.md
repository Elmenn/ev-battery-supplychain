# Plan 04-01 Summary: Fix WETH Shielding

**Status:** COMPLETE
**Date:** 2026-01-27

## What Was Built

Fixed WETH shielding to work correctly with Railgun SDK and updated UI with side-by-side balances.

## Key Changes

### shield.js
- Added TXIDVersion enum import from @railgun-community/shared-models
- Fixed SDK calls: `gasEstimateForShield` and `populateShield` use `networkName` (string), not `chain` (object)
- Keep `chain` object for `refreshBalances` and `awaitWalletScan` (they expect chain)
- Wrapped balance refresh in try-catch - transaction confirmation is the success criteria

### PrivateFundsDrawer.jsx
- Side-by-side balance display (Public | Private WETH)
- Spinner with "Shielding WETH..." during operation
- Toast notification with Etherscan link on success
- Pending balance indicator

## Commits

| Hash | Message |
|------|---------|
| ff96ecc9 | feat(04-01): fix shield.js to use TXIDVersion enum |
| 0a094293 | feat(04-01): update PrivateFundsDrawer with side-by-side balances and Etherscan toast |
| e39fe282 | fix(04-01): ensure SDK initialized before shield operations |
| 23c248ca | fix(04-01): use networkName instead of chain object for SDK calls |

## Human Verification

- User shielded WETH successfully
- Transaction confirmed: `0x21965c2912060a40d982f0f2e8cea9e04639d579ef174af79ffd576f5f95d1f2`
- Pending balance displays correctly
- Etherscan link in toast works

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| networkName vs chain | SDK functions have different parameter expectations - gasEstimateForShield/populateShield want NetworkName string, refreshBalances wants chain object |
| Non-blocking balance refresh | Transaction confirmation is success - balance refresh failure shouldn't report shield as failed |

## Next Steps

Phase 5: Private Payment Transfer - send private payment from buyer to seller's 0zk address.
