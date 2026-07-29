# Module 7: Credential API

## Purpose
REST API wrapping CredentialContract's issuance/revocation flow, plus real
IPFS document storage via Pinata — matching the synopsis's "secure upload
and hash-based verification of academic documents" requirement.

## Design Decisions
- **Same prepare-and-react pattern as Module 6.** The backend uploads
  documents and computes hashes, but the issuer's own wallet submits
  `issueCredential`/`revokeCredential` directly via MetaMask — the backend
  never custodies funds or executes transactions on anyone's behalf.
- **SHA-256 for document hashing** (via Node's `crypto` module), matching
  the synopsis's stated hashing option and kept simple — no need for
  Keccak-256 just because the destination is a Solidity contract; `bytes32`
  storage works identically regardless of which hash algorithm produced it.
- **Hash computed from the exact uploaded buffer**, not by re-downloading
  from IPFS afterward — guarantees the on-chain hash corresponds to
  precisely what was pinned, with no gap for the file to change in between.
- **In-memory file handling only** (Multer's `memoryStorage`) — documents
  are never written to local disk; they're received, hashed, forwarded to
  Pinata, and discarded from memory.
- **CredentialRecord as an off-chain index**, populated reactively by the
  listener, purely for fast querying (`/mine`, `/issued`) without
  re-reading the chain on every request. CredentialContract itself remains
  the actual source of truth for validity/expiry/revocation.
- **`/revoke-intent` is a UX convenience check, not a security boundary.**
  It tells the frontend whether the on-chain call will likely succeed, but
  CredentialContract's own `require` checks are what actually enforce
  authorization — this route could return `true` incorrectly due to a bug
  and it would still be safe, since the contract itself would reject an
  unauthorized revocation attempt.

## Bug Found and Fixed: Missing Event Fields
**Symptom (caught before it became a real bug):** While writing the
reactive handler for `CredentialIssued`, direct inspection of the actual
Solidity event signature revealed it only emits `credentialId`, `subject`,
`issuer`, `documentHash`, `expiresAt`, and `timestamp` — NOT
`credentialType` or `ipfsHash`, even though those fields exist in the
contract's stored `Credential` struct and are returned by `getCredential()`.

**Fix:** The reactive handler makes one additional read call
(`getCredential(credentialId)`) to fetch the complete record before
indexing it into MongoDB — a free view call, just an extra RPC round-trip,
no gas cost. Verified live: `credentialType: "certification"` was
correctly fetched and indexed, confirming the fix works, not just compiles.

## Endpoints
- `POST /api/credentials/upload` — ISSUER_ROLE only; uploads a document to
  IPFS, returns CID + SHA-256 hash to submit on-chain
- `GET /api/credentials/mine` — credentials where caller is the subject
- `GET /api/credentials/issued` — credentials where caller is the issuer
  (ISSUER_ROLE only)
- `POST /api/credentials/revoke-intent` — pre-flight authorization check
  before an on-chain revocation attempt

## Verified End-to-End
Full loop tested live with a real file: upload to Pinata → SHA-256 hash
computed → on-chain `issueCredential` call → WebSocket listener catches
`CredentialIssued` → `getCredential` fetches full record → CredentialRecord
indexed with correct `credentialType` and `ipfsHash` → `/mine` and
`/revoke-intent` endpoints both return correct data.

## Known Limitations / Future Work
- No file type/content validation on upload beyond a 10MB size cap —
  acceptable for a prototype; a production system might restrict to
  specific document types (PDF, common image formats).
- `/revoke-intent`'s admin-override path (mentioned in error message) isn't
  actually implemented yet — currently only checks `isIssuer`. Low
  priority since the contract-level check already covers CONTRACT_ADMIN_ROLE
  correctly; this is a UX-layer gap only.
