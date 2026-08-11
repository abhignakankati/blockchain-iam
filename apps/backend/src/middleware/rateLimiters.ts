import rateLimit from "express-rate-limit";

/**
 * General baseline limit across the whole API - generous enough not to
 * interfere with normal use, but bounds worst-case load from any single
 * client.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/**
 * Nonce issuance is unauthenticated by necessity (it's the first step of
 * login) - without a tighter limit here, an attacker could spam
 * /api/auth/nonce to fill the database with unused nonce documents.
 */
export const nonceLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many nonce requests, please try again later" },
});

/**
 * Delegation verification is deliberately unauthenticated (external
 * verifiers may hold no identity in the system at all - see Module 9),
 * which makes it the one endpoint in the whole API most exposed to naive
 * token brute-forcing. A 64-character random hex token is not practically
 * guessable within any reasonable rate limit, but limiting anyway is
 * cheap, defense-in-depth insurance.
 */
export const verifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts, please try again later" },
});
