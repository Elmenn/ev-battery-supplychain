# Phase 1: Cleanup Duplicate Implementations - Context

**Gathered:** 2026-01-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate fragmented Railgun code into a single, working implementation. Remove redundant files, update imports, coordinate frontend/backend, and establish a clean foundation for subsequent phases. No new features — just cleanup and organization.

</domain>

<decisions>
## Implementation Decisions

### Consolidation Strategy
- Claude evaluates each file and keeps what's functional
- Claude determines best organization (may use railgun-clean/ or reorganize by function)
- Delete serve-html.ts entirely — fresh implementation based on SDK docs
- Claude evaluates whether 50% scan reset workaround is still needed (extract if so)

### Import Migration Approach
- Update imports incrementally, one component at a time
- Verify each component works before moving to next
- If a function is missing after import update, implement it immediately (not stub)
- Claude decides if temporary re-exports/shim needed based on complexity
- Clean up unused imports when touching each file

### Legacy Code Handling
- Claude determines secure approach for wallet credential storage (backend vs client-side)
- Coordinate frontend and backend to use consistent patterns
- Claude decides per-file whether to remove debug code (remove noise, keep useful logging)
- Claude assesses which polyfills the SDK actually requires, remove extras

### Testing Strategy
- Add unit tests for the new consolidated module
- Use whatever testing framework is already configured (likely Jest)
- Both mock tests (fast, verify logic) and integration tests (hit real testnet)
- Must verify frontend builds AND starts after cleanup

### Claude's Discretion
- Final folder structure organization
- Whether to extract SDK workaround or skip it
- Debug code removal decisions per-file
- Polyfill trimming decisions
- Testing framework choice
- Whether compatibility shim is needed during transition

</decisions>

<specifics>
## Specific Ideas

- serve-html.ts should be deleted entirely — user wants fresh start, no legacy baggage
- If functions are missing after consolidation, implement them immediately rather than stubbing
- Backend Railgun service should be coordinated with frontend changes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-cleanup-duplicate-implementations*
*Context gathered: 2026-01-20*
