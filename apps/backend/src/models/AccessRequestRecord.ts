import mongoose, { Schema, Document } from "mongoose";

export type AccessRequestStatus = "Pending" | "Granted" | "Denied";

/**
 * Off-chain index of access requests, populated reactively. Tracks the
 * request's lifecycle status separately from currentlyGranted, since
 * access can later be revoked (AccessRevoked) without that being a new
 * "request" - the original request's historical status (e.g. Granted)
 * stays intact for audit purposes, while currentlyGranted reflects live
 * access state.
 */
export interface IAccessRequestRecord extends Document {
  resourceId: string;
  requester: string;
  status: AccessRequestStatus;
  currentlyGranted: boolean;
  requestedAt: Date;
  decidedAt: Date | null;
}

const accessRequestRecordSchema = new Schema<IAccessRequestRecord>({
  resourceId: { type: String, required: true, index: true },
  requester: { type: String, required: true, lowercase: true, index: true },
  status: { type: String, enum: ["Pending", "Granted", "Denied"], required: true },
  currentlyGranted: { type: Boolean, default: false },
  requestedAt: { type: Date, required: true },
  decidedAt: { type: Date, default: null },
});

// One active record per (resourceId, requester) pair - a new request
// overwrites the previous one, matching the contract's own behavior
// (getAccessRequest returns only the most recent request).
accessRequestRecordSchema.index({ resourceId: 1, requester: 1 }, { unique: true });

export const AccessRequestRecord = mongoose.model<IAccessRequestRecord>(
  "AccessRequestRecord",
  accessRequestRecordSchema
);
