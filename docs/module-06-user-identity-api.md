# Module 6: User/Identity API

## Purpose
REST API wrapping IdentityContract's registration/approval flow, bridging
off-chain profile data (name, email, department) with the on-chain identity
record — without the backend ever custodying user funds or private keys.

## Design Decisions
- **User's own wallet submits on-chain transactions directly** (via
  MetaMask/Ethers in the frontend, not yet built) — the backend never
  holds a funded wallet or executes transactions on anyone's behalf. This
  is a meaningfully more decentralized and secure design than a
  backend-pays-gas model.
- **Backend role: prepare + react, not execute.** `POST
  /api/users/register-intent` creates an off-chain profile and computes
  the hash the user will submit; the backend then reacts to the resulting
  on-chain event via the Module 4 listener, rather than submitting
  anything itself.
- **`offChainRefHash = keccak256(profileId + SERVER_SALT)`** — a
  server-wide salt (not per-record) keeps this simple while preventing a
  leaked MongoDB `_id` alone from being correlated to a wallet address on
  a public block explorer.
- **Profile status is derived entirely from on-chain events**, never
  settable via a direct API call — this is what keeps the off-chain
  database honest relative to the blockchain as the actual source of
  truth. There is no code path where a profile can become "Active"
  without a real `IdentityApproved` event having actually occurred.
- **Reactive listener hooks added to the existing Module 4 indexer**
  (`eventHandlers` keyed by `"ContractName.EventName"`) rather than a
  separate polling mechanism — one dispatch point, generic indexing always
  happens, side effects happen only for explicitly mapped events. Each
  handler's query filter only matches the expected prior state (e.g.
  status must still be `PendingOnChain`), making every handler idempotent.

## Critical Bug Found and Fixed: Ethers HTTP Filter Expiry
**Symptom:** After the backend had been running for a while (including
across a session gap), on-chain events stopped being caught live. The
console showed repeated `@TODO TypeError: results is not iterable` from
Ethers' `FilterIdEventSubscriber`.

**Root cause:** Ethers v6's default `JsonRpcProvider` uses HTTP
filter-polling (`eth_newFilter` / `eth_getFilterChanges`). Hardhat's local
node can expire/invalidate idle filters, and a subsequent poll returning
something other than a proper result array crashes the subscriber
silently — the listener appears to keep running (no error surfaces to the
main process) but stops actually catching new events.

**Fix:** Switched live event listening to a `WebSocketProvider`
(`eth_subscribe`), which uses server-push delivery instead of
client-side polling — no filter expiry, no polling gap. The backfill
script continues using the plain HTTP provider, since one-off historical
`queryFilter` calls aren't affected by this failure mode.

**Verified:** Ran the complete registration → listener catch → approval →
listener catch loop live, with zero restarts or manual backfill needed,
confirming the fix holds under real conditions.

## Operational note (learning callout)
A `hardhat node` restart wipes the entire in-memory chain, including every
deployed contract — this isn't specific to this module, but it's the
first time it actually bit us mid-session. Contract addresses stayed
identical after redeployment (deterministic deployment from the same
account), but the *code* at those addresses had to be redeployed from
scratch. Established habit going forward: after any Hardhat node restart,
always redeploy before assuming existing addresses still point to live
contracts.

## Endpoints
- `POST /api/users/register-intent` — creates an off-chain profile,
  returns the hash to submit on-chain
- `GET /api/users/me` — returns the profile linked to the authenticated
  wallet (requires valid JWT)
- `GET /api/users/pending` — admin-only, lists profiles awaiting approval

## Verified End-to-End
Full loop tested live: registration intent created via API → on-chain
`registerIdentity` call → listener reacts, profile status →
`PendingApproval` → admin queue endpoint correctly lists it (with live
`ADMIN_ROLE` check) → on-chain `approveIdentity` call → listener reacts,
profile status → `Active`. Confirmed in MongoDB directly.

## Known Limitations / Future Work
- No endpoint yet for an admin to reject/deny a pending registration
  off-chain (the on-chain contract has no "reject" concept either — a
  pending identity just never gets approved). Acceptable for now; revisit
  if needed.
- `getAdminToken.ts` and `testAuthFlow.ts` remain as manual dev-testing
  scripts, not part of the production API surface.
