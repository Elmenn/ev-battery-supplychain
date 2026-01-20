# EV Battery Supply Chain - Railgun Integration

## What This Is

A supply chain marketplace for EV batteries with privacy-preserving payments. Sellers list products, buyers purchase them through an escrow contract, and the system generates verifiable credentials for provenance tracking. This milestone focuses on fixing the broken Railgun integration to enable private payments where transaction amounts are hidden.

## Core Value

Buyers can pay sellers privately — the payment amount is hidden on-chain.

## Requirements

### Validated

- ✓ Product creation with price commitments — existing
- ✓ Public purchase flow through escrow contract — existing
- ✓ Verifiable Credential generation and IPFS storage — existing
- ✓ ZKP backend for Pedersen commitments — existing
- ✓ Smart contract lifecycle (Listed → Purchased → Delivered) — existing

### Active

- [ ] Clean up duplicate Railgun implementations
- [ ] Working Railgun wallet connection in browser
- [ ] ETH → WETH wrapping
- [ ] WETH shielding (public → private balance)
- [ ] Private payment transfer to seller's 0zk address
- [ ] POI (Proof of Innocence) verification
- [ ] Record private payment on-chain (memoHash, railgunTxRef)

### Out of Scope

- UI/UX improvements — focus on functionality first
- New features beyond private payments — this milestone is cleanup + fix
- Production deployment — testnet (Sepolia) is the target
- Mobile support — browser only

## Context

**Current state:** Multiple overlapping Railgun implementations exist:
- `frontend/src/lib/railgun-clean/` — incomplete new structure
- `frontend/src/lib/railgun-legacy-shim.js` — old approach
- `frontend/src/lib/railgun-browser-init.js` — another attempt
- `frontend/src/lib/railgun-client-browser.js` — yet another
- `frontend/src/lib/serve-html.ts` — 11,360 line monolith

Components have TODO comments saying "update to use new structure" but nothing works. The `wrapETHtoWETH` function throws "not yet implemented."

**Known SDK issue:** UTXO merkletree scan resets at 50% progress — current code has a workaround patch.

**Tech stack:** React frontend, ethers.js, @railgun-community/wallet 10.4.0, Sepolia testnet.

## Constraints

- **SDK version**: Must use @railgun-community/wallet 10.4.0 (already installed)
- **Network**: Sepolia testnet for development
- **Browser-based**: Railgun must work in browser, not just Node.js backend
- **Existing contracts**: Must integrate with existing ProductEscrow contract's `recordPrivatePayment()` function

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Clean up before rebuilding | Multiple broken implementations cause confusion | — Pending |
| Research Railgun first | User unfamiliar with exact flow, need correct approach | — Pending |

---
*Last updated: 2026-01-20 after initialization*
