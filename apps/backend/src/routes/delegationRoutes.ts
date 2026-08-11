import { Router, Request, Response } from "express";
import { z } from "zod";
import { createDelegationGrant, verifyWithDelegationToken, revokeDelegationGrant } from "../services/delegationService.js";
import { verifyLimiter } from "../middleware/rateLimiters.js";
import { requireAuth, requireActiveIdentity } from "../middleware/auth.js";

const router = Router();

const createGrantSchema = z.object({
  credentialId: z.string().min(1),
  durationHours: z.number().int().min(1).max(24 * 30).default(48),
});

/**
 * POST /api/delegation/grant
 * Creates a delegation grant for a credential. Requires the caller to be
 * the credential's subject or issuer. Returns the raw token exactly once.
 */
router.post("/grant", requireAuth, requireActiveIdentity, async (req: Request, res: Response) => {
  const parsed = createGrantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    const result = await createDelegationGrant(
      parsed.data.credentialId,
      req.user!.address,
      parsed.data.durationHours
    );
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create delegation grant";
    res.status(400).json({ error: message });
  }
});

/**
 * GET /api/delegation/verify/:token
 * Verifies a credential using a delegation token. Deliberately requires
 * NO authentication - this is for external verifiers (clients, employers,
 * auditors) who may have no identity in the system at all, matching the
 * synopsis's "External Verifier" actor.
 */
router.get("/verify/:token", verifyLimiter, async (req: Request, res: Response) => {
  const token = typeof req.params.token === "string" ? req.params.token : req.params.token[0];
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const result = await verifyWithDelegationToken(token);
  res.json(result);
});

const revokeSchema = z.object({
  credentialId: z.string().min(1),
});

/**
 * POST /api/delegation/revoke
 * Revokes all active delegation grants for a credential, created by the
 * authenticated caller.
 */
router.post("/revoke", requireAuth, requireActiveIdentity, async (req: Request, res: Response) => {
  const parsed = revokeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    await revokeDelegationGrant(parsed.data.credentialId, req.user!.address);
    res.json({ revoked: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke delegation grant";
    res.status(400).json({ error: message });
  }
});

export default router;
