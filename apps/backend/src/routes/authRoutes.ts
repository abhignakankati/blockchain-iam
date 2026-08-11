import { Router, Request, Response } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import { issueNonce, verifySiweSignature } from "../services/authService.js";
import { nonceLimiter } from "../middleware/rateLimiters.js";
import { logger } from "../config/logger.js";

const router = Router();

const nonceRequestSchema = z.object({
  address: z.string().refine((val) => ethers.isAddress(val), "Must be a valid Ethereum address"),
});

/**
 * GET /api/auth/nonce?address=0x...
 * Issues a one-time nonce for the given wallet address to begin SIWE login.
 * The client embeds this nonce into the SIWE message it asks the user to sign.
 */
router.get("/nonce", nonceLimiter, async (req: Request, res: Response) => {
  const parsed = nonceRequestSchema.safeParse({ address: req.query.address });

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    const nonce = await issueNonce(parsed.data.address);
    res.json({ nonce });
  } catch (error) {
    logger.error("Failed to issue nonce", { error });
    res.status(500).json({ error: "Failed to issue nonce" });
  }
});

const verifyRequestSchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
});

/**
 * POST /api/auth/verify
 * Body: { message: string, signature: string }
 * Verifies a signed SIWE message and issues a JWT on success.
 */
router.post("/verify", async (req: Request, res: Response) => {
  const parsed = verifyRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const result = await verifySiweSignature(parsed.data.message, parsed.data.signature);

  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }

  res.json({ token: result.token, address: result.address });
});

export default router;
