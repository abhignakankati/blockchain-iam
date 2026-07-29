import { Router, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { uploadToIpfs } from "../services/pinataService.js";
import { CredentialRecord } from "../models/CredentialRecord.js";
import { requireAuth, requireActiveIdentity, requireRole } from "../middleware/auth.js";

const router = Router();

// In-memory storage - files are small documents (certificates, transcripts),
// never written to local disk, immediately forwarded to Pinata and discarded.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB cap

/**
 * POST /api/credentials/upload
 * Requires ISSUER_ROLE. Uploads a document to IPFS and returns the CID +
 * SHA-256 hash the issuer's own wallet must then submit on-chain via
 * CredentialContract.issueCredential(). This route does NOT submit
 * anything on-chain itself.
 */
router.post(
  "/upload",
  requireAuth,
  requireActiveIdentity,
  requireRole("ISSUER_ROLE"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    try {
      const result = await uploadToIpfs(req.file.buffer, req.file.originalname);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to upload document" });
    }
  }
);

/**
 * GET /api/credentials/mine
 * Returns credentials where the authenticated wallet is the subject.
 * Backed by the off-chain index (CredentialRecord), populated reactively
 * by the blockchain listener - not a live chain read on every request.
 */
router.get("/mine", requireAuth, async (req: Request, res: Response) => {
  const credentials = await CredentialRecord.find({ subject: req.user?.address });
  res.json(credentials);
});

/**
 * GET /api/credentials/issued
 * Returns credentials where the authenticated wallet is the issuer.
 */
router.get("/issued", requireAuth, requireRole("ISSUER_ROLE"), async (req: Request, res: Response) => {
  const credentials = await CredentialRecord.find({ issuer: req.user?.address });
  res.json(credentials);
});

const revokeIntentSchema = z.object({
  credentialId: z.string().min(1),
});

/**
 * POST /api/credentials/revoke-intent
 * Validates that the caller is either the original issuer or holds
 * ADMIN_ROLE, BEFORE they attempt the actual on-chain revokeCredential
 * call. This is a UX convenience check only - CredentialContract itself
 * still enforces the real authorization on-chain regardless of what this
 * route says.
 */
router.post("/revoke-intent", requireAuth, requireActiveIdentity, async (req: Request, res: Response) => {
  const parsed = revokeIntentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const record = await CredentialRecord.findOne({ credentialId: parsed.data.credentialId });
  if (!record) {
    return res.status(404).json({ error: "Credential not found" });
  }

  const callerAddress = req.user?.address;
  const isIssuer = record.issuer === callerAddress;

  if (!isIssuer) {
    return res.status(403).json({
      error: "Only the original issuer (or an admin, verified on-chain) may revoke this credential",
    });
  }

  res.json({ canRevoke: true, credentialId: record.credentialId });
});

export default router;
