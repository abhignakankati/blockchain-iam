import { Router, Request, Response } from "express";
import { ResourceRecord } from "../models/ResourceRecord.js";
import { AccessRequestRecord } from "../models/AccessRequestRecord.js";
import { requireAuth, requireActiveIdentity } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/access/resources
 * Lists all registered resources. Backed by the off-chain index,
 * populated reactively from ResourceRegistered/ApproversUpdated events.
 * A frontend uses this to show "available resources to request access to."
 */
router.get("/resources", requireAuth, async (_req: Request, res: Response) => {
  const resources = await ResourceRecord.find();
  res.json(resources);
});

/**
 * GET /api/access/resources/:resourceId
 * Returns a single resource's indexed metadata.
 */
router.get("/resources/:resourceId", requireAuth, async (req: Request, res: Response) => {
  const resource = await ResourceRecord.findOne({ resourceId: req.params.resourceId });
  if (!resource) {
    return res.status(404).json({ error: "Resource not found" });
  }
  res.json(resource);
});

/**
 * GET /api/access/my-requests
 * Returns access requests made by the authenticated wallet.
 */
router.get("/my-requests", requireAuth, requireActiveIdentity, async (req: Request, res: Response) => {
  const requests = await AccessRequestRecord.find({ requester: req.user?.address });
  res.json(requests);
});

/**
 * GET /api/access/pending-for-me
 * Returns Pending access requests for resources where the authenticated
 * wallet is a designated approver (approver1 or approver2). This is why
 * ResourceRecord indexes approvers - "am I an approver for this resource"
 * isn't otherwise queryable off-chain without it.
 */
router.get("/pending-for-me", requireAuth, requireActiveIdentity, async (req: Request, res: Response) => {
  const address = req.user?.address;

  const resourcesIApprove = await ResourceRecord.find({
    $or: [{ approver1: address }, { approver2: address }],
  });
  const resourceIds = resourcesIApprove.map((r) => r.resourceId);

  const pendingRequests = await AccessRequestRecord.find({
    resourceId: { $in: resourceIds },
    status: "Pending",
  });

  res.json(pendingRequests);
});

export default router;
