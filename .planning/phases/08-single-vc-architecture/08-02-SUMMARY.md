---
phase: 08-single-vc-architecture
plan: 02
subsystem: frontend-utilities
tags: [ipfs, eip-712, signing, caching, retry]
requires: []
provides: [fetchJson-with-cache, uploadJson-with-retry, v2-eip712-signing]
affects: [08-03, 09]
tech-stack:
  added: []
  patterns: [retry-with-backoff, localStorage-caching, conditional-field-stripping]
key-files:
  created: []
  modified:
    - frontend/src/utils/ipfs.js
    - frontend/src/utils/signVcWithMetamask.js
decisions:
  - id: ipfs-cache-prefix
    decision: "Use vc_cache_ prefix for localStorage cache keys"
    rationale: "Namespaced to avoid collisions with other localStorage usage"
  - id: no-retry-4xx
    decision: "Skip retry on 4xx client errors, only retry network/5xx"
    rationale: "4xx errors are deterministic (bad request, auth failure) - retrying wastes time"
  - id: flatten-listing-for-eip712
    decision: "Flatten v2.0 listing sub-object to credentialSubject level before signing"
    rationale: "Avoids changing EIP-712 types object; v2.0 data fits existing type structure after flattening"
  - id: export-preparePayload
    decision: "Export preparePayloadForSigning for testability"
    rationale: "Enables direct unit testing of payload preparation logic"
metrics:
  duration: ~2 minutes
  completed: 2026-02-17
---

# Phase 8 Plan 2: IPFS Fetch + EIP-712 v2.0 Signing Summary

IPFS fetchJson with localStorage caching and retry, uploadJson retry wrapper, and EIP-712 signing updates for v2.0 VC schema with mutable field stripping and listing flattening.

## Tasks Completed

### Task 1: Add fetchJson and uploadJson retry to ipfs.js
- Added `withRetry(fn, maxRetries)` helper with exponential backoff (1s, 2s, 4s)
- 4xx errors thrown immediately without retry; network/5xx errors retried
- `fetchJson(cid)`: validates CID, strips `ipfs://` prefix, checks localStorage cache (`vc_cache_` prefix), fetches from gateway with retry, caches result
- `uploadJson(obj)`: existing logic wrapped in `withRetry`, error objects now carry `status` property
- **Commit:** d0eee05e

### Task 2: Update EIP-712 types for v2.0 VC schema
- `preparePayloadForSigning` now strips mutable sections: `payment`, `delivery`, `previousVersion`
- Serializes `priceCommitment` object to `price` string for EIP-712 compatibility
- Flattens `listing` sub-object: moves `certificateCredential` and `componentCredentials` up to `credentialSubject`
- All new logic uses conditional checks (`!== undefined`) so v1.0 VCs pass through unchanged
- EIP-712 `types` object unchanged -- flattening makes v2.0 data fit existing type structure
- Exported `preparePayloadForSigning` for direct testability
- **Commit:** 24b47755

## Deviations from Plan

### Auto-added

**1. [Rule 2 - Missing Critical] Exported preparePayloadForSigning**
- **Found during:** Task 2
- **Issue:** Function was internal-only but verification test needed to call it directly
- **Fix:** Changed `function` to `export function`
- **Files modified:** frontend/src/utils/signVcWithMetamask.js
- **Impact:** No breaking change -- adds an export, does not remove any

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| ipfs-cache-prefix | Use `vc_cache_` prefix for localStorage cache keys | Namespaced to avoid collisions |
| no-retry-4xx | Skip retry on 4xx, only retry network/5xx | 4xx errors are deterministic |
| flatten-listing-for-eip712 | Flatten v2.0 listing sub-object before signing | Reuses existing EIP-712 types without modification |
| export-preparePayload | Export preparePayloadForSigning | Enables direct unit testing |

## Verification Results

- ipfs.js exports both `uploadJson` and `fetchJson`
- `withRetry` implements exponential backoff with 4xx passthrough
- `fetchJson` checks localStorage cache before network fetch
- `preparePayloadForSigning` strips payment, delivery, previousVersion from v2.0 VCs
- `preparePayloadForSigning` serializes priceCommitment to price string
- `preparePayloadForSigning` flattens listing sub-object
- v1.0 VCs pass through unchanged (all conditional checks are no-ops)
- signVcWithMetamask and signVcAsSeller exports unchanged

## Next Phase Readiness

Plan 08-03 (VC verifier) can now use:
- `fetchJson(cid)` to retrieve VCs from IPFS with caching
- `preparePayloadForSigning(vc)` to prepare payloads for signature verification
- Both v1.0 and v2.0 VC formats are handled correctly
