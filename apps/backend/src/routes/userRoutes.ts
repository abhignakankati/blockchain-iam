import { Router, Request, Response } from "express";
import { z } from "zod";
import { createRegistrationIntent } from "../services/userService.js";
import { UserProfile } from "../models/UserProfile.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const registerIntentSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  department: z.string().optional(),
});

/**
 * POST /api/users/register-intent
 * Creates the off-chain profile and returns the offChainRefHash the
 * frontend must submit via IdentityContract.registerIdentity() directly
 * from the user's own wallet.
 */
router.post("/register-intent", async (req: Request, res: Response) => {
  const parsed = registerIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const result = await createRegistrationIntent(parsed.data);
  res.status(201).json(result);
});

/**
 * GET /api/users/me
 * Returns the profile linked to the authenticated wallet, if any.
 */
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const profile = await UserProfile.findOne({ walletAddress: req.user?.address });

  if (!profile) {
    return res.status(404).json({ error: "No profile linked to this wallet yet" });
  }

  res.json(profile);
});

/**
 * GET /api/users/pending
 * Admin-only: lists profiles awaiting approval (status PendingApproval).
 * The admin still approves via their own wallet calling approveIdentity()
 * directly - this route only surfaces who's waiting.
 */
router.get("/pending", requireAuth, requireRole("ADMIN_ROLE"), async (_req: Request, res: Response) => {
  const pending = await UserProfile.find({ status: "PendingApproval" });
  res.json(pending);
});

export default router;
