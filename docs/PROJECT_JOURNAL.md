# Blockchain-Based IAM System — Project Journal

**Project:** Blockchain-Based Identity and Access Management System for Secure Credential Verification and Controlled Resource Access
**Repository:** `blockchain-iam` (public, GitHub)
**Status as of this document:** Modules 0–5 complete and merged; Module 6 in progress

---

## 1. Project Overview

A blockchain-based IAM system for a general organizational environment, using a hybrid on-chain/off-chain architecture:

- **On-chain:** identity proofs, credential hashes, role assignments, access permissions, and immutable event logs
- **Off-chain:** full documents, personal data (MongoDB), and files (IPFS — not yet built)

Core capabilities being implemented: identity registration + admin approval, credential issuance/revocation/expiry, RBAC + ABAC access control with risk-based approval tiers, delegated verification, and an immutable audit trail.

---

## 2. Tech Stack (as actually implemented so far)

| Layer | Technology | Notes |
|---|---|---|
| Smart contracts | Solidity 0.8.28, OpenZeppelin 5.x, Hardhat 2.22.x | Hardhat 2.x chosen deliberately over the newer Hardhat 3.x for ecosystem maturity |
| Contract testing | Hardhat + Chai + TypeChain (ethers-v6 target) | 85/85 tests passing across 3 contracts |
| Backend | Node.js, Express 5, TypeScript (NodeNext/ESM), Mongoose, Winston | `tsx` for dev (faster than `ts-node` for this use case) |
| Database | MongoDB 7, via Docker Compose locally | Will move to MongoDB Atlas at deployment |
| Auth | SIWE (EIP-4361) + JWT + Passport | No passwords, no private key transmission |
| Env validation | Zod | Fails fast on missing/invalid config |
| Package management | pnpm workspaces (monorepo) | `apps/frontend`, `apps/backend`, `contracts`, `packages/shared` |

**Environment:** Windows 11 + WSL2 (Ubuntu 22.04), Docker Desktop with WSL integration, VS Code with WSL extension.

---

## 3. Working Methodology

Every module follows the same disciplined cycle, with no step skipped:

1. **Architecture explained first** — design decisions and trade-offs discussed *before* any code is written
2. **Code implemented in full** — no pseudo-code, no placeholders
3. **Verified before handoff** — contracts verified via direct `solc` compilation when sandboxed; backend verified via real running processes
4. **Tests written and run** — both success and failure paths
5. **Real bugs found and fixed as they occurred** (not hidden) — e.g. wall-clock vs. blockchain-time bug in Module 2, a test-authoring bug in Module 3, several `.env`/directory-creation mishaps in Module 5 — each diagnosed methodically rather than papered over
6. **Documented** — a `docs/module-XX-*.md` file per module, capturing purpose, decisions, and known limitations
7. **Git workflow** — feature branch → commit (Conventional Commits format) → push → PR against `develop` with a structured description → review "Files changed" → merge → delete branch → sync local `develop`

### Branching strategy
- `main` — always deployable, protected, PR-only
- `develop` — integration branch
- `feature/<name>` — one branch per module

---

## 4. Module-by-Module Record

### Module 0 — Repository & Environment Setup
- WSL2 (Ubuntu) + Docker Desktop with WSL integration configured
- Node.js via `nvm`, `pnpm` via Corepack, Git + SSH key for GitHub
- Monorepo scaffolded: `apps/`, `contracts/`, `packages/shared/`, `docs/`
- `.gitignore` covering `node_modules`, `.env` (all variants), build outputs, Hardhat artifacts
- GitHub repo created (public), `main`/`develop` branches established, branch protection on `main`

### Module 1 — IdentityContract
**Purpose:** Trust root of the system — decentralized identity registration, admin approval, and lifecycle management.

**Key design decisions:**
- No PII on-chain — only wallet address, an off-chain reference hash, role, and status
- Two-phase registration: `registerIdentity` (self-service → `Pending`) → `approveIdentity` (admin-only → `Active`)
- OpenZeppelin `AccessControl` for RBAC (`ADMIN_ROLE`, `ISSUER_ROLE`, `VERIFIER_ROLE`)
- Explicit lifecycle states: `None → Pending → Active ⇄ Suspended → Revoked` (revocation is irreversible by design)
- Every mutating function emits an event (this becomes the audit trail's data source later)

**Result:** 22/22 tests passing. Deployed and manually verified on local Hardhat network.

### Module 2 — CredentialContract
**Purpose:** Credential issuance, revocation, and expiry — depends on IdentityContract for issuer/subject verification.

**Key design decisions:**
- **Admin-updatable IdentityContract reference** (not immutable) — survives an IdentityContract redeployment without needing to redeploy this contract
- Only a document hash + IPFS CID reference stored on-chain; actual documents stay off-chain
- Expiry as a timestamp (`0` = never expires); revocation is separate from expiry (different triggers, different audit events)
- Deterministic `credentialId` via `keccak256(subject, issuer, docHash, nonce)`

**Bug found and fixed:** An expiry test computed "future" time from `Date.now()` (wall-clock), which failed once enough prior tests had advanced the simulated chain's internal clock past real time. Fixed by deriving timestamps from `ethers.provider.getBlock("latest")` instead — the correct pattern for any Solidity test involving time.

**Result:** 50/50 tests passing (28 new + 22 from Module 1).

### Module 3 — AccessControlContract
**Purpose:** The RBAC + ABAC policy engine — decides resource access with risk-based approval tiers.

**Key design decisions:**
- **Three sensitivity tiers**, mapped directly to the synopsis's own wording ("automatic, single-admin, or dual-approval"):
  - `Normal` → automatic grant once RBAC+ABAC policy passes
  - `Sensitive` → policy passes, then **one** designated approver must sign off
  - `Critical` → policy passes, then **both** designated approvers must sign off
- **Resource-specific designated approvers** (chosen over "any admin") — the resource owner names specific approvers per resource, more realistic and auditable
- Generic `bytes32` key/value ABAC attributes (e.g. department, clearance) — flexible, not hardcoded to specific fields
- Approver-count validation enforced both at registration **and** at update time, so a resource can never drift into an invalid configuration

**Bug found and fixed:** A test attempted to re-register an identity that was already active from a shared setup step — the contract correctly rejected the duplicate registration; the test itself was wrong, not the contract.

**Result:** 85/85 tests passing across all three contracts combined.

### Module 4 — Backend Foundation + Event Indexer
**Purpose:** Express/TypeScript backend scaffold, plus the system's actual "immutable audit trail" — implemented as an event indexer rather than a fourth smart contract.

**Key decision — scope change from original synopsis plan:** The synopsis called for a standalone `AuditLogContract`. Since all three existing contracts already emit immutable, tamper-evident events on-chain, a fourth contract re-logging the same data would add gas cost with no additional security benefit. Instead, a backend indexer listens to all three contracts and writes to MongoDB — functionally equivalent, more defensible engineering.

**Implementation:**
- `AuditLog` Mongoose model — single collection with `contractName`/`eventName` discriminators, idempotent via a unique `(transactionHash, logIndex)` index
- Wildcard event listener (`contract.on("*", ...)`) — generically captures any event from any contract, including OpenZeppelin's own built-in events, without per-event code
- Backfill script sharing the same `recordEvent` logic as the live listener, so historical and real-time indexing never diverge in behavior
- Zod-validated environment config; Winston structured logging

**Verified end-to-end:** Ran real `registerIdentity`/`approveIdentity` transactions via `hardhat console` while the backend was running — events appeared in logs and MongoDB within milliseconds, fully correct.

### Module 5 — Auth (SIWE + JWT)
**Purpose:** Wallet-based authentication with no passwords and no private key transmission.

**Key design decisions:**
- **SIWE (EIP-4361)** via the `siwe` npm package, not a custom scheme — standardized message format, audited verification logic
- Nonce stored in MongoDB with a 5-minute TTL index, deleted immediately on successful verification (genuinely one-time-use, prevents replay)
- **On-chain identity/role status checked live on every protected request** (via `requireActiveIdentity`/`requireRole` middleware), not trusted from JWT claims alone — this closes the gap where a suspended user's still-valid JWT would otherwise continue granting access until natural expiry
- Composable middleware (`requireAuth`, `requireActiveIdentity`, `requireRole`) rather than one monolithic check

**Verified end-to-end:** `testAuthFlow.ts` script ran the complete flow — nonce request → SIWE message signing (real Hardhat test wallet) → signature verification → JWT issuance → protected route access — all successful.

**Operational note:** Several `.env` handling mistakes occurred during this module (a placeholder value left in place, then duplicate lines from repeated fixes) — resolved by verifying the *actual* stored value's length and a masked preview rather than assuming a fix worked, and by never re-pasting real secret values into chat once the pattern was noticed.

---

## 5. Current State of the Repository

```
blockchain-iam/
├── apps/
│   └── backend/
│       ├── src/
│       │   ├── config/        (env, database, logger, passport)
│       │   ├── models/        (AuditLog, Nonce, UserProfile [in progress])
│       │   ├── services/      (blockchainListener, authService)
│       │   ├── middleware/    (auth)
│       │   ├── routes/        (authRoutes)
│       │   ├── scripts/       (backfillEvents, testAuthFlow)
│       │   └── contracts/abis/ (copied contract ABIs)
│       └── package.json, tsconfig.json, .env.example
├── contracts/
│   ├── contracts/  (IdentityContract.sol, CredentialContract.sol, AccessControlContract.sol)
│   ├── test/       (85 passing tests total)
│   └── scripts/deploy.ts
├── docs/
│   ├── module-01-identity-contract.md
│   ├── module-02-credential-contract.md
│   ├── module-03-access-control-contract.md
│   ├── module-04-backend-foundation-and-indexer.md
│   └── module-05-auth.md
├── docker-compose.yml  (MongoDB)
├── pnpm-workspace.yaml
└── README.md  (with live module progress checklist)
```

**Three separate terminals are required for local development:**
1. `cd contracts && npx hardhat node` — persistent local blockchain (must stay running)
2. `cd contracts && npx hardhat run scripts/deploy.ts --network localhost` — deploy (only after node restarts)
3. `cd apps/backend && pnpm dev` — backend server + live event listener

---

## 6. What's In Progress Right Now: Module 6 — User/Identity API

**Decision already made:** The user's own MetaMask wallet submits the actual `registerIdentity`/`approveIdentity` transactions directly — the backend never custodies funds or private keys. The backend's role is to prepare off-chain profile data and *react* to on-chain events, not to submit transactions on anyone's behalf.

**Flow being built:**
1. `POST /api/users/register-intent` — user submits profile data (name, email, department); backend creates a MongoDB record with status `PendingOnChain` and returns a computed `offChainRefHash`
2. Frontend/MetaMask calls `registerIdentity(offChainRefHash)` directly — backend is not involved in this transaction
3. The Module 4 listener gains a **reactive hook**: when `IdentityRegistered` fires, look up the profile by hash, link the wallet address, flip status to `PendingApproval`
4. Admin approves via their own MetaMask (`approveIdentity`) — the listener reacts to `IdentityApproved`, flipping status to `Active`

**Completed so far in this module:** `UserProfile` Mongoose model, `SERVER_SALT` added to env config (used to compute `offChainRefHash = keccak256(profileId + SERVER_SALT)` so a leaked MongoDB ID alone can't be correlated to a wallet on a public block explorer).

**Not yet done:** the reactive listener hooks, the actual `/api/users/*` routes, and end-to-end verification.

---

## 7. Full Remaining Roadmap

**Phase 2 — Backend (continuing)**
- **Module 6** (in progress): User/Identity API — registration intent, reactive listener hooks, admin approval queue
- Module 7: Credential API (issuance intent, IPFS/Pinata upload, hash computation)
- Module 8: Access request/approval workflow API (wraps AccessControlContract)
- Module 9: Delegated verification API
- Module 10: Audit log query API (built on the Module 4 indexer)
- Module 11: Security hardening pass (Helmet review, rate limiting, input/file validation, dependency audit)

**Phase 3 — Frontend**
- React 19 + Vite + TypeScript + TailwindCSS + ShadCN UI scaffold
- Wallet connect (MetaMask + Ethers.js)
- Dashboards: User, Admin, Issuer, Verifier
- Analytics + notifications

**Phase 4 — Integration, Documentation, Deployment**
- End-to-end tests, security tests, performance tests
- Full Docker Compose stack, GitHub Actions CI/CD
- Deploy: MongoDB Atlas, Render (backend), Vercel (frontend), Sepolia testnet (contracts)
- Full documentation set: SRS, SDD, API docs, user/admin/deployment/maintenance manuals

---

## 8. Recommended Next Immediate Step

Finish Module 6 exactly where it left off:
1. Add reactive hooks to `blockchainListener.ts` for `IdentityRegistered` and `IdentityApproved`
2. Build `POST /api/users/register-intent`, `GET /api/users/me`, `GET /api/users/pending` (admin-only), `POST /api/users/:id/approve` (admin-only, triggers nothing directly — admin still approves via their own wallet; this route may simply surface the on-chain call's needed parameters)
3. Verify end-to-end: submit a profile → compute hash → simulate the on-chain `registerIdentity` call (as done in Module 4's live test) → confirm MongoDB profile status transitions correctly → simulate `approveIdentity` → confirm final `Active` status
4. Document, commit, PR, merge — same cycle as every prior module
