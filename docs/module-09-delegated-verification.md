# Module 9: Delegated Verification API

## Purpose
Time-bound, revocable verification links allowing external parties (who
may hold no identity in the system at all) to verify a specific
credential — matching the synopsis's "delegated verification workflow"
and "External Verifier" actor.

## Scope Decision
Neither IdentityContract nor CredentialContract has an on-chain concept of
time-bound delegation (VERIFIER_ROLE is permanent until revoked;
verifyDocumentHash() is already a public view function). Rather than add
new Solidity code and redeploy, this module implements delegation entirely
off-chain: a backend-issued opaque token scoped to one credential, with an
expiry and manual revocation.

**Trade-off accepted:** the delegation grant itself is not on-chain or
tamper-evident — a database compromise could reveal which tokens exist
(though not the raw token values themselves, since only their hash is
stored). This is a reasonable trade-off for a prototype-scope feature that
matches an external-party-facing workflow better than requiring every
verifier to hold a wallet and sign in via SIWE.

## Design Decisions
- **Opaque random token, not a signed JWT.** Simpler than verifying
  signatures for a simple present/absent capability check; same pattern
  as a typical API key.
- **Only tokenHash (SHA-256) is stored, never the raw token** — identical
  security posture to password storage. The raw token is returned exactly
  once, at creation time.
- **No authentication required on the verify endpoint** — deliberately,
  since external verifiers (clients, employers, auditors) may have no
  identity in the system. The token itself is the credential.
- **Only the credential's subject or issuer may create a grant**, checked
  against CredentialRecord (Module 7) — matches "the student or
  institution authorizes a third party."
- **Verification result always reflects live on-chain state** via
  CredentialContract.isValid() — the token only grants permission to
  check; it never fabricates or caches a stale result.

## Endpoints
- `POST /api/delegation/grant` — creates a grant; requires subject/issuer
  authorization; returns the raw token once
- `GET /api/delegation/verify/:token` — no authentication required;
  returns live validity + credential metadata
- `POST /api/delegation/revoke` — revokes all active grants for a
  credential created by the caller

## Verified End-to-End
Full lifecycle tested with real requests:
1. Created a grant for a real credential (48-hour duration) — received a
   64-character token
2. Verified successfully with zero authentication — confirmed valid: true
   with correct credential metadata
3. Confirmed an invalid/garbage JWT is rejected before reaching
   application logic (Passport's own 401)
4. Revoked the grant, then confirmed the same token now correctly returns
   valid: false with "This verification link has been revoked"

## Known Limitations / Future Work
- No rate limiting on the verify endpoint yet (anyone with a valid token
  can call it unlimited times) — acceptable for now, revisit in Module 11
  if abuse becomes a concern for a public-facing deployment.
- No UI/email-sending mechanism to actually deliver the token to an
  external party yet — that's a frontend/Module 12+ concern.
