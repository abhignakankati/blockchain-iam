import mongoose, { Schema, Document } from "mongoose";

export type SensitivityLevel = "Normal" | "Sensitive" | "Critical";

/**
 * Off-chain index of registered resources, populated reactively from
 * ResourceRegistered/ApproversUpdated events. Exists for fast listing/
 * lookup (e.g. "what resources exist, what does each require") without
 * re-reading the chain on every request. AccessControlContract remains
 * the actual source of truth for policy enforcement.
 */
export interface IResourceRecord extends Document {
  resourceId: string;
  owner: string;
  sensitivityLevel: SensitivityLevel;
  requiredRole: string;
  requiredAttributeKey: string;
  requiredAttributeValue: string;
  approver1: string;
  approver2: string;
  registeredAt: Date;
}

const resourceRecordSchema = new Schema<IResourceRecord>({
  resourceId: { type: String, required: true, unique: true },
  owner: { type: String, required: true, lowercase: true, index: true },
  sensitivityLevel: { type: String, enum: ["Normal", "Sensitive", "Critical"], required: true },
  requiredRole: { type: String, default: "" },
  requiredAttributeKey: { type: String, default: "" },
  requiredAttributeValue: { type: String, default: "" },
  approver1: { type: String, default: "", lowercase: true, index: true },
  approver2: { type: String, default: "", lowercase: true, index: true },
  registeredAt: { type: Date, required: true },
});

export const ResourceRecord = mongoose.model<IResourceRecord>("ResourceRecord", resourceRecordSchema);
