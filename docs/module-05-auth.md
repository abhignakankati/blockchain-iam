# Module 5: Auth (SIWE + JWT)

## Purpose
Wallet-based authentication using Sign-In With Ethereum (EIP-4361). No
passwords, no private key transmission — the backend verifies a wallet
signature to prove control of an address, then issues a JWT for subsequent
API calls.

## Design Decisions
- **SIWE standard (EIP-4361) via the `siwe` npm package**, not a custom
  nonce-signing scheme — industry-standard message format, well-audited
  verification logic, and immediately compatible with any wallet or
  frontend library that already speaks SIWE.
- **Nonce stored in MongoDB with a 5-minute TTL index**, not in-memory —
  survives a backend restart mid-login and works correctly if the backend
  ever scales beyond a single instance.
- **Nonce deleted immediately on successful verification** (not marked
  "used") — this is what makes it genuinely one-time-use and prevents
  replay of a captured signed message.
- **On-chain identity/role status checked live on every protected
  request**, not baked into the JWT at login time. A JWT remains valid for
  its full lifetime regardless of what happens afterward; if an admin
  suspends a user two minutes after login, a JWT-only check would still
  grant access for up to the token's remaining hour. Live `isActive()` /
  `hasRole()` checks close this gap — free, since they're read-only view
  calls with no gas cost.
- **Composable middleware** (`requireAuth`, `requireActiveIdentity`,
  `requireRole`) rather than one monolithic auth check — different routes
  need different combinations (e.g. viewing your own pending registration
  needs only `requireAuth`, not `requireActiveIdentity`).
- **JWT expiry: 1 hour, no refresh token** — kept in scope for a prototype;
  refresh token rotation/revocation is a legitimate but non-essential
  future enhancement.

## Verified End-to-End
`src/scripts/testAuthFlow.ts` (dev-only verification script, not part of
the API surface) ran the full flow against a real Hardhat test wallet:
nonce request → SIWE message signing → signature verification → JWT
issuance → protected route access, all successful.

## Environment Variables Added
`JWT_SECRET` (min. 32 characters, enforced by Zod schema), `JWT_EXPIRY`,
`SIWE_DOMAIN`, `SIWE_URI`.

## Operational note (learning callout)
During setup, a placeholder value (`<GENERATED_SECRET>`) was accidentally
left in `.env` for `JWT_SECRET` after a copy-paste step, then further
complicated by duplicate `JWT_SECRET` lines from repeated fix attempts.
Resolved by verifying the *actual* stored value's length and a masked
preview (first/last few characters) rather than assuming a fix worked —
useful general practice: verify secret state without ever re-printing the
secret itself in a shared context.

## Known Limitations / Future Work
- No refresh token / logout-side token revocation yet (a compromised JWT
  remains valid until natural expiry).
- Rate limiting on `/api/auth/nonce` is not yet in place — planned for the
  Module 11 security hardening pass, to prevent nonce-issuance spam.
