# Module 10: Audit Log Query API

## Purpose
Filterable, paginated query endpoints over the AuditLog collection
(populated since Module 4), matching the synopsis's "search and
verification interface for approved institutional users" and general
transparency/auditability requirements.

## Design Decisions
- **Read-only by design.** No write/delete endpoints exist at all — an
  audit trail editable via API isn't an audit trail. Only the blockchain
  listener ever writes to this collection.
- **Two endpoints, two audiences.** `/logs` (admin-only, fully filterable)
  for institutional oversight; `/my-activity` (any active identity, scoped
  to their own actions) for individual transparency without needing admin
  privileges.
- **Pagination capped at 100/page** — prevents a single request from
  pulling the entire audit history into memory.

## Critical Bug Found and Fixed: Case-Sensitivity Mismatch
**Symptom:** `/api/audit/my-activity` returned `total: 0` for a wallet
that was demonstrably the actor on multiple real events.

**Root cause:** JWTs store wallet addresses in lowercase
(`siweMessage.address.toLowerCase()`, from Module 5). `AuditLog.actor`,
however, stored whatever case Ethers returned from the on-chain event
(checksummed mixed-case, e.g. `0xf39Fd6e51...`). MongoDB string equality
is case-sensitive by default, so a lowercase query value never matched
the stored mixed-case value. Every other model in this project
(UserProfile, CredentialRecord, ResourceRecord, etc.) already had
`lowercase: true` in its schema for exactly this reason — AuditLog was
the one model that never got this treatment back in Module 4, and it
went undetected until this module's first query-by-actor test.

**Fix:** Added `lowercase: true` to the `actor` field in the Mongoose
schema. Existing (already mixed-case) documents were cleared and
re-populated via `pnpm backfill`, since the schema option only normalizes
data written after the change - it doesn't retroactively fix existing
records.

**Verified:** Re-ran the same query after the fix; `my-activity` correctly
returned `total: 9`, including the deployer's own identity registration,
approval actions, and constructor-time role grants across all three
contracts.

## Endpoints
- `GET /api/audit/logs` — admin-only; filters: contractName, eventName,
  actor, resourceId, fromDate, toDate; paginated
- `GET /api/audit/my-activity` — any active identity; scoped to the
  caller's own actor address; paginated

## Verified End-to-End
- Basic query returned correct total and correctly sorted (newest-first)
  results
- Filtering by eventName correctly narrowed results
- Bug found, root-caused, fixed, and re-verified with real data

## Known Limitations / Future Work
- No full-text search across `details` yet — acceptable for now, could
  add a MongoDB text index later if needed.
- Filtering is AND-only across provided filters; no OR/complex query
  support, which matches the realistic use cases identified for this
  module.
