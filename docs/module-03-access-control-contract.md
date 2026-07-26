# Module 3: AccessControlContract

## Purpose
The RBAC + ABAC policy engine. Decides whether a wallet can access a given
resource, using role checks (delegated to IdentityContract), attribute
checks (department/semester/clearance-style key-value pairs), and a
risk-based approval tier per resource.

## Design Decisions
- **Three sensitivity tiers, mapped directly to the synopsis's wording**
  ("approval may be automatic, single-admin, or dual-approval"):
  - `Normal` — automatic grant once RBAC+ABAC policy passes
  - `Sensitive` — policy passes, then ONE designated approver must sign off
  - `Critical` — policy passes, then BOTH designated approvers must sign off
- **Resource-specific designated approvers** (not "any admin") — the
  resource owner names specific approvers per resource, which is more
  realistic than a generic admin pool and matches the "Resource Owner"
  actor's described control in the synopsis.
- **`_validateApprovers` enforced at both registration and update** — a
  resource can never drift into an invalid approver configuration (e.g. a
  Sensitive resource somehow acquiring a second approver) at any point in
  its lifecycle.
- **ABAC attributes as generic bytes32 key-value pairs** — supports any
  attribute type (department, semester, clearance) without hardcoding
  fields on-chain; the backend defines what each key/value hash means.
- **Policy eligibility (`_meetsPolicy`) is separate from approval-tier
  logic** — RBAC/ABAC check happens once per request; the sensitivity tier
  only decides what happens after that check passes. Clean separation
  between "are you allowed in principle" and "how much sign-off does this
  resource need."
- **Explicit `denyAccess`** in addition to implicit denial on policy
  failure — lets designated approvers or admins reject a request that
  passed the RBAC/ABAC check but shouldn't proceed for other reasons,
  preserving a complete audit trail either way.

## Testing note (learning callout)
A test in `updateApprovers` initially tried to re-register an identity
(`stranger`) that was already active from the outer `beforeEach` setup,
triggering a correct `"Identity: already registered"` revert — the
contract was right, the test was wrong. Fixed by reusing the already-active
identity directly. A reminder that a failing test isn't always a contract
bug; check the test's own setup logic first.

## Test Coverage
85/85 tests passing across all three contracts combined (22 IdentityContract
+ 28 CredentialContract + 35 AccessControlContract), including full coverage
of all three sensitivity tiers and their approver validation rules.

## Contract Addresses (local Hardhat network)
Printed on each `deploy.ts` run — copy into `apps/backend/.env` as
`IDENTITY_CONTRACT_ADDRESS`, `CREDENTIAL_CONTRACT_ADDRESS`, and
`ACCESS_CONTROL_CONTRACT_ADDRESS`.

## Known Limitations / Future Work
- Attribute values are opaque bytes32 hashes; there's no on-chain way to
  enumerate "all attributes a wallet has" — the backend must track which
  attribute keys are in use.
- No credential-validity check is wired into resource policy yet (e.g.
  "must hold a non-expired 'clearance' credential to access this
  resource") — CredentialContract and AccessControlContract remain
  independent for now; combining them is a natural extension, not
  required by the current synopsis scope.
