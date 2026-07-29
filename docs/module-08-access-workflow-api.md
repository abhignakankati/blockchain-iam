# Module 8: Access Request/Approval Workflow API

## Purpose
REST API wrapping AccessControlContract's RBAC+ABAC policy engine and
three-tier approval system (Normal/Sensitive/Critical), plus a resource
listing endpoint for frontend discovery.

## Design Decisions
- **No "intent" preparation step**, unlike Modules 6-7. Resources already
  exist on-chain (registered directly by admins via their own wallet); the
  backend's role here is purely indexing + reactive updates + querying,
  since there's no off-chain document/profile data to prepare beforehand.
- **ResourceRecord indexes approver addresses**, which is what makes
  `GET /api/access/pending-for-me` possible — "am I a designated approver
  for any resource" isn't otherwise queryable off-chain without this index.
- **AccessRequestRecord separates `status` (historical/audit) from
  `currentlyGranted` (live state)** — access can be revoked later via
  `AccessRevoked` without erasing the fact that a request was originally
  Granted; the two fields serve different purposes.
- **Unique compound index on `(resourceId, requester)`** — matches the
  contract's own behavior (`getAccessRequest` returns only the most recent
  request per pair), and proved genuinely valuable when three duplicate
  on-chain requests during testing collapsed cleanly into one up-to-date
  record instead of three conflicting rows.

## Critical Operational Discovery: WebSocket Idle Disconnection
**Symptom:** During testing, a real on-chain `AccessRequested` transaction
succeeded, but the backend's live listener never reacted to it — no error,
no crash, just silence. The server's `/health` endpoint responded normally
throughout.

**Root cause:** The WebSocket connection (introduced in Module 6 to fix
the earlier HTTP filter-expiry bug) can itself go idle/stale after an
extended period without an explicit keep-alive or reconnect handler.
Unlike the HTTP filter bug, this failure mode produces **no error at
all** — the subscription just silently stops delivering.

**Recovery used:** `pnpm backfill` recovered all missed events correctly,
confirming the backfill script's value as a genuine safety net, not just
an initial-setup convenience. **Not yet fixed at the code level** — see
Known Limitations below.

## Endpoints
- `GET /api/access/resources` — lists all registered resources
- `GET /api/access/resources/:resourceId` — single resource detail
- `GET /api/access/my-requests` — requests made by the authenticated wallet
- `GET /api/access/pending-for-me` — Pending requests where the
  authenticated wallet is a designated approver

## Verified End-to-End
- **Normal tier:** resource registered → request auto-granted in the same
  transaction → correctly indexed and queryable
- **Sensitive tier:** resource registered with one designated approver →
  request moves to Pending → approver's on-chain approval correctly
  caught live via WebSocket → status flips to Granted
- Both proven with real transactions, real wallets, real query endpoint
  responses

## Known Limitations / Future Work
- **WebSocket reconnection is not yet implemented.** A production
  deployment needs either a periodic keep-alive ping, a reconnect-on-close
  handler, or a scheduled backfill run (e.g. every few minutes) as a
  safety net regardless of live-connection health. This is the top
  priority item for the Module 11 security/reliability hardening pass.
- Critical tier's dual-approval path is thoroughly covered by Module 3's
  85 unit tests at the contract level, but wasn't separately re-verified
  through this API layer — acceptable, since the indexing logic is
  identical regardless of tier.
