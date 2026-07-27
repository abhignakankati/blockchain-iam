# Module 4: Backend Foundation + Event Indexer

## Purpose
Establishes the Express + TypeScript backend project and builds the
blockchain event indexer — the synopsis's "immutable audit trail"
requirement, implemented as a MongoDB-backed index of all three smart
contracts' events rather than a redundant on-chain AuditLogContract.

## Design Decisions
- **Event-based audit trail, no dedicated AuditLogContract.** Every
  contract already emits immutable, tamper-evident events on-chain; a
  fourth contract re-logging the same information would add gas cost with
  no additional security. The real engineering work is a reliable indexer,
  not more on-chain storage.
- **Single `auditlogs` collection with a `contractName`/`eventName`
  discriminator**, rather than one collection per event type — enables a
  single unified "everything involving wallet X" query, which is the
  actual purpose of an audit trail.
- **Wildcard event listener (`contract.on("*", ...)`)** instead of
  registering each event name individually — automatically picks up any
  event from any contract, including OpenZeppelin's own built-in
  `RoleGranted`/`RoleRevoked` events, without per-event code.
- **Idempotent upsert keyed on `(transactionHash, logIndex)`** — protects
  against duplicate audit entries if the listener ever redelivers an event
  after a brief RPC disconnect/reconnect.
- **Backfill script + live listener share the same `recordEvent` function**
  — one code path handles both historical and real-time indexing, so
  there's no risk of the two diverging in behavior over time.
- **`tsx` instead of `ts-node`** for the backend specifically (Hardhat's
  test runner still uses `ts-node`) — faster restarts during iterative
  Express development.
- **Zod-validated environment variables at startup** — fails fast with a
  clear error listing exactly which variables are missing, instead of a
  confusing runtime crash three files deep.

## Verified End-to-End
1. `pnpm backfill` — successfully indexed all historical events from the
   three deployed contracts (constructor role grants).
2. Live listener — running `registerIdentity` + `approveIdentity` via
   `hardhat console` while the backend was running resulted in immediate,
   correct indexing of `IdentityRegistered`, `IdentityApproved`, and
   `IdentityStatusChanged`, visible in both server logs and MongoDB within
   milliseconds.

## Schema
See `src/models/AuditLog.ts`. Key fields: `contractName`, `eventName`,
`transactionHash`, `logIndex` (unique compound index), `blockNumber`,
`actor` (first address-typed arg), `resourceId` (first bytes32-typed arg),
`details` (full named argument map), `timestamp` (derived from the block's
own timestamp, not insertion time).

## Running Locally
Requires three terminals:
1. `cd contracts && npx hardhat node` (persistent local blockchain)
2. `cd contracts && npx hardhat run scripts/deploy.ts --network localhost`
   (only needed once per node restart)
3. `cd apps/backend && pnpm dev` (starts server + live listener)

Historical backfill (safe to re-run anytime): `pnpm backfill`

## Known Limitations / Future Work
- No pagination or filtering API yet on top of the `auditlogs` collection —
  that's Module 12 (Audit Log Query API), which builds directly on this
  schema.
- Listener does not currently handle an RPC provider disconnect/reconnect
  explicitly (Ethers.js WebSocket providers support this better than the
  HTTP provider currently in use) — acceptable for local development,
  worth revisiting before production deployment against a hosted RPC
  provider.
