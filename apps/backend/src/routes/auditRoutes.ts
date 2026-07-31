import { Router, Request, Response } from "express";
import { z } from "zod";
import { AuditLog } from "../models/AuditLog.js";
import { requireAuth, requireActiveIdentity, requireRole } from "../middleware/auth.js";

const router = Router();

const logsQuerySchema = z.object({
  contractName: z.string().optional(),
  eventName: z.string().optional(),
  actor: z.string().optional(),
  resourceId: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/audit/logs
 * Admin-only. Filterable, paginated query across the full audit trail.
 * Matches the synopsis's "search and verification interface for approved
 * institutional users" and general transparency/auditability requirement.
 */
router.get("/logs", requireAuth, requireActiveIdentity, requireRole("ADMIN_ROLE"), async (req: Request, res: Response) => {
  const parsed = logsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { contractName, eventName, actor, resourceId, fromDate, toDate, limit, skip } = parsed.data;

  const filter: Record<string, unknown> = {};
  if (contractName) filter.contractName = contractName;
  if (eventName) filter.eventName = eventName;
  if (actor) filter.actor = actor.toLowerCase();
  if (resourceId) filter.resourceId = resourceId;
  if (fromDate || toDate) {
    filter.timestamp = {
      ...(fromDate ? { $gte: new Date(fromDate) } : {}),
      ...(toDate ? { $lte: new Date(toDate) } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.json({ logs, total, limit, skip });
});

/**
 * GET /api/audit/my-activity
 * Any authenticated active identity. Returns audit log entries where the
 * caller's own wallet is the actor - lets a regular user see their own
 * history without needing admin privileges.
 */
router.get("/my-activity", requireAuth, requireActiveIdentity, async (req: Request, res: Response) => {
  const parsed = logsQuerySchema.pick({ limit: true, skip: true }).safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { limit, skip } = parsed.data;
  const filter = { actor: req.user?.address };

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.json({ logs, total, limit, skip });
});

export default router;
