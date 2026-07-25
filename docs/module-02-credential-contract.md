# Module 2: CredentialContract

## Purpose
Handles credential issuance, revocation, and expiry. Depends on
IdentityContract to confirm issuer/subject are active identities and that
the issuer holds ISSUER_ROLE.

## Design Decisions
- **Admin-updatable IdentityContract reference** (via `setIdentityContract`,
  guarded by CONTRACT_ADMIN_ROLE) rather than immutable — survives an
  IdentityContract redeployment without needing to redeploy this contract.
- **Only hash + metadata on-chain.** `documentHash` (e.g. SHA-256 of a PDF)
  and an IPFS CID reference are stored; the actual document stays off-chain.
- **Expiry as a timestamp, 0 = never expires.** Matches real-world
  credential lifecycles (e.g. certifications that lapse).
- **Revocation is separate from expiry** — a credential can be revoked
  before its natural expiry (e.g. fraud discovered), each with a distinct
  event for audit purposes.
- **Deterministic credentialId** via `keccak256(subject, issuer, docHash, nonce)`
  — no external ID-generation service needed.

## Testing note (learning callout)
An early version of the expiry test computed a "future" timestamp from
`Date.now()` (wall-clock time). This failed once enough prior tests had
mined blocks, because Hardhat's simulated chain time had drifted ahead of
real time. Fixed by deriving future/past timestamps from
`ethers.provider.getBlock("latest").timestamp` instead — the correct
pattern for any Solidity test involving time.

## Test Coverage
50/50 tests passing across IdentityContract + CredentialContract combined,
including cross-contract integration (issuer/subject active-identity checks,
role checks delegated to IdentityContract).

## Contract Addresses (local Hardhat network)
Printed on each `deploy.ts` run — copy into `apps/backend/.env` as
`IDENTITY_CONTRACT_ADDRESS` and `CREDENTIAL_CONTRACT_ADDRESS`.
