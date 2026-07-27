import mongoose, { Schema, Document } from "mongoose";

export interface IAuditLog extends Document {
  contractName: string;
  eventName: string;
  transactionHash: string;
  logIndex: number;
  blockNumber: number;
  actor?: string;
  resourceId?: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  contractName: { type: String, required: true },
  eventName: { type: String, required: true },
  transactionHash: { type: String, required: true },
  logIndex: { type: Number, required: true },
  blockNumber: { type: Number, required: true },
  actor: { type: String, index: true },
  resourceId: { type: String, index: true },
  details: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, required: true },
});

auditLogSchema.index({ transactionHash: 1, logIndex: 1 }, { unique: true });
auditLogSchema.index({ contractName: 1, eventName: 1 });

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema);
