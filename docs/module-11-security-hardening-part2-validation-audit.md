# Module 11 (Part 2): Rate Limiting, Validation Review, Dependency Audit

## Rate Limiting
- **General baseline**: 300 requests / 15 min across all `/api` routes
- **`/api/auth/nonce`**: 20 requests / 5 min (unauthenticated by necessity;
  without this limit an attacker could spam nonce creation to fill the
  database)
- **`/api/delegation/verify/:token`**: 30 requests / 5 min (deliberately
  unauthenticated per Module 9's design; cheap defense-in-depth against
  token brute-forcing, though a 64-char random hex token isn't practically
  guessable within any reasonable rate limit anyway)

**Verified live**: looped 25 requests against `/api/auth/nonce` — first 20
returned `200`, requests 21-25 correctly returned `429`.

## Input/File Validation Review
Systematic pass across all routes found two real gaps, both fixed:

1. **No file-type validation on credential uploads.** Previously any file
   type up to 10MB was accepted. Added a `fileFilter` restricting uploads
   to `application/pdf`, `image/png`, `image/jpeg`, `image/webp` -
   reasonable formats for an actual credential document.
2. **CORS was fully open** (`cors()` with no configuration, accepting
   requests from any origin). Added `ALLOWED_ORIGINS` to env config
   (comma-separated, defaults to Vite's dev port `http://localhost:5173`)
   and configured `cors({ origin: env.allowedOrigins, credentials: true })`.

**Verified live**: confirmed `Access-Control-Allow-Origin` is correctly
echoed back for the allowed origin and absent for a disallowed one -
proving a real browser would block cross-origin script access to
responses from unlisted origins.

Everything else reviewed and found already adequate:
- All POST/PUT bodies already validated via Zod schemas (every route,
  since Module 6)
- Helmet applied globally since Module 4
- Mongoose's typed schemas + Zod parsing before any query construction
  already prevent NoSQL injection via malformed input
- No HTML rendering anywhere in this API, so XSS is not applicable

## Dependency Audit
`pnpm audit` on the full workspace reported 35 vulnerabilities (16 high,
13 moderate, 6 low). Every single one traces through
`contracts > @nomicfoundation/hardhat-toolbox` - Hardhat's own
development/testing toolchain (Mocha, TypeChain, solidity-coverage, gas
reporters). None of this code ships in or runs as part of the deployed
backend API.

**Scoped audit of production dependencies only**
(`pnpm audit --prod` from `apps/backend`) reports **zero known
vulnerabilities**.

This distinction matters: reporting "35 vulnerabilities" without this
context would be misleading, since the actual deployed attack surface is
clean. The Hardhat toolchain findings are worth monitoring for future
`hardhat-toolbox` updates, but pose no risk to the running system as it
exists today.
