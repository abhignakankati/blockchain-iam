# Module 1: IdentityContract

## Purpose
Manages decentralized identity registration, admin approval, and lifecycle
status for all users of the system. Acts as the trust root that
CredentialContract, AccessControlContract, and AuditLogContract build on.

## Design Decisions
- **No PII on-chain.** Only wallet address, an off-chain reference hash,
  role, and status are stored. Full profile data lives in MongoDB/IPFS.
- **Two-phase registration.** `registerIdentity` (self-service, sets status
  to Pending) then `approveIdentity` (admin-only, sets status to Active).
  Mirrors the synopsis's Module 1 requirement exactly.
- **OpenZeppelin AccessControl** for role management (ADMIN_ROLE,
  ISSUER_ROLE, VERIFIER_ROLE) instead of a custom ownership pattern —
  audited, gas-efficient, extensible to multiple admins.
- **Explicit lifecycle states** (Pending/Active/Suspended/Revoked) instead
  of a boolean flag. Suspension is reversible; revocation is not.
- **Every mutation emits an event.** This is the data source for the future
  AuditLogContract and the backend's audit trail.

## Contract Address (local Hardhat network)
Deployed address is printed on each `deploy.ts` run — copy into
`apps/backend/.env` as `IDENTITY_CONTRACT_ADDRESS` when the backend module
begins.

## Test Coverage
22/22 tests passing, covering:
- Deployment role assignment
- Registration (success, duplicate rejection, zero-hash rejection)
- Approval (success, non-admin rejection, wrong-state rejection)
- Suspend/reactivate (success and invalid-state rejection both directions)
- Revocation (success from Active and Suspended, irreversibility, non-admin rejection)
- Role granting (success, inactive-identity rejection, unrecognized-role rejection)

Run with: `pnpm --filter contracts test` (from repo root) or `npx hardhat test`
(from `contracts/`).

## Known Limitations / Future Work
- No key-rotation mechanism if a user loses wallet access (flagged in
  synopsis's Limitations section — "wallet management and key recovery
  remain practical usability challenges").
- `grantIdentityRole` currently admin-only; delegated role-granting is out
  of scope for this module (see Module 5: Delegated Verification).
