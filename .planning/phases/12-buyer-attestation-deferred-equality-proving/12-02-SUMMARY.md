---
phase: 12-buyer-attestation-deferred-equality-proving
plan: 02
subsystem: api
tags: [rust, actix-web, zkp, schnorr, chaum-pedersen, merlin, bulletproofs, curve25519]

# Dependency graph
requires:
  - phase: 12-buyer-attestation-deferred-equality-proving
    provides: ZKP backend infrastructure with PedersenGens and Merlin transcript patterns (from existing mod.rs, pedersen.rs, main.rs)

provides:
  - prove_equality() and verify_equality() in equality_proof.rs using Chaum-Pedersen DLEQ sigma protocol
  - POST /zkp/generate-equality-proof endpoint returning proof_r_hex, proof_s_hex, verified:true
  - POST /zkp/verify-equality-proof endpoint returning verified:bool for any proof+commitment pair
  - EqualityProof struct with r_announcement and s_response [u8;32] fields

affects: [12-03, 12-04, 12-05, equalityProofClient.js, ProductDetail buyer panel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Chaum-Pedersen DLEQ Schnorr sigma proof pattern with Merlin Fiat-Shamir
    - Merlin transcript order: context -> C_price -> C_pay -> R -> challenge (fixed, must match prove+verify)
    - Immediate self-verification in generate endpoint (verified flag in response)
    - Scalar::from_bytes_mod_order for parsing scalar hex inputs (not from_canonical_bytes)

key-files:
  created:
    - zkp-backend/src/zk/equality_proof.rs
  modified:
    - zkp-backend/src/zk/mod.rs
    - zkp-backend/src/main.rs

key-decisions:
  - "merlin-transcript-fixed-order: Transcript order context->C_price->C_pay->R->challenge must be identical in prove and verify - any deviation breaks the Fiat-Shamir binding"
  - "self-verify-in-generate: prove_equality immediately followed by verify_equality in generate endpoint - surfaces errors before returning 200 to caller"
  - "from_bytes_mod_order-for-input-scalars: Use Scalar::from_bytes_mod_order (not from_canonical_bytes) when parsing user-supplied hex scalars - canonical check would reject many valid user inputs"
  - "binding-context-as-json-value: binding_context is serde_json::Value not String - serialized deterministically via serde_json::to_vec for transcript binding"

patterns-established:
  - "EqualityProof struct: [u8; 32] fields for r_announcement and s_response - matches hex encoding pattern in other ZKP endpoints"
  - "parse_compressed closure: inline fn in endpoint for parsing 32-byte hex to CompressedRistretto - reused in both equality endpoints"

requirements-completed: []

# Metrics
duration: 20min
completed: 2026-03-04
---

# Phase 12 Plan 02: Equality Proof Endpoints Summary

**Chaum-Pedersen DLEQ Schnorr sigma proof module in Rust with two actix-web endpoints: POST /zkp/generate-equality-proof (self-verifies, returns verified:true) and POST /zkp/verify-equality-proof (returns verified:false for tampered input)**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-04T10:44:44Z
- **Completed:** 2026-03-04T11:05:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Implemented full Chaum-Pedersen DLEQ Schnorr sigma protocol in `equality_proof.rs` with correct Merlin transcript order matching the RESEARCH.md specification
- Added two actix-web endpoints to `main.rs` with hex parsing, error handling, and immediate self-verification on proof generation
- `cargo build` exits 0 with no errors — the Rust binary compiles cleanly; only a pre-existing unused import warning (unrelated to this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create equality_proof.rs and extend mod.rs** - `b5bb77b8` (feat)
2. **Task 2: Add 2 equality-proof endpoints to main.rs** - `df9de1e2` (feat)

## Files Created/Modified
- `zkp-backend/src/zk/equality_proof.rs` - prove_equality() and verify_equality() using PedersenGens::default() + Merlin transcript
- `zkp-backend/src/zk/mod.rs` - Added `pub mod equality_proof;` declaration
- `zkp-backend/src/main.rs` - Import, four new structs (EqualityProofRequest/Response, EqualityVerifyRequest/Response), two endpoint functions, two .service() registrations

## Decisions Made

- Used `Scalar::from_bytes_mod_order` (not `from_canonical_bytes`) when parsing user-supplied scalar hex inputs in the endpoint. `from_canonical_bytes` would reject values >= group order, breaking valid user inputs.
- `binding_context` is typed as `serde_json::Value` instead of `String` so the JSON structure is serialized deterministically via `serde_json::to_vec` for the Merlin transcript — avoids whitespace/ordering issues from user-supplied strings.
- The generate endpoint performs immediate self-verification (`verify_equality` called right after `prove_equality`) to surface any transcript mismatch bugs at generation time rather than silently returning an invalid proof.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both tasks compiled on first attempt. The existing Rust codebase patterns (PedersenGens, Merlin transcript, hex parsing, actix-web endpoint shape) transferred cleanly to the equality proof module.

## User Setup Required

None - no external service configuration required. The ZKP backend binary is rebuilt in-place; restart the server to pick up the new endpoints.

## Next Phase Readiness

- `/zkp/generate-equality-proof` and `/zkp/verify-equality-proof` are live and functional after server restart
- Ready for Plan 12-03: `equalityProofClient.js` JavaScript client that calls these endpoints
- Ready for Plan 12-04: ProductDetail buyer panel integration consuming the equality proof flow
- All three success criteria met: cargo build clean, Merlin transcript order correct, self-verification in generate endpoint

---
*Phase: 12-buyer-attestation-deferred-equality-proving*
*Completed: 2026-03-04*

## Self-Check: PASSED

- FOUND: zkp-backend/src/zk/equality_proof.rs
- FOUND: zkp-backend/src/zk/mod.rs (with pub mod equality_proof)
- FOUND: zkp-backend/src/main.rs (with 2 new endpoints registered)
- FOUND: .planning/phases/12-buyer-attestation-deferred-equality-proving/12-02-SUMMARY.md
- FOUND commit b5bb77b8 (Task 1: equality_proof.rs + mod.rs)
- FOUND commit df9de1e2 (Task 2: main.rs endpoints)
