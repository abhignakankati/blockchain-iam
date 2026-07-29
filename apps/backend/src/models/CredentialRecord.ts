import mongoose, { Schema, Document } from "mongoose";

export type CredentialRecordStatus = "Active" | "Revoked";

/**
 * Off-chain index of on-chain credentials, populated reactively by the
 * blockchain listener. Exists purely for fast querying (e.g. "show me all
 * of my credentials") without re-reading the chain on every request -
 * CredentialContract itself remains the actual source of truth for
 * validity/expiry/revocation status.
 */
export interface ICredentialRecord extends Document {
  credentialId: string; // bytes32 id from CredentialContract, as a hex string
  subject: string;
  issuer: string;
  documentHash: string;
  credentialType: string;
  ipfsHash: string;
  issuedAt: Date;
  expiresAt: Date | null;
  status: CredentialRecordStatus;
}

const credentialRecordSchema = new Schema<ICredentialRecord>({
  credentialId: { type: String, required: true, unique: true },
  subject: { type: String, required: true, lowercase: true, index: true },
  issuer: { type: String, required: true, lowercase: true, index: true },
  documentHash: { type: String, required: true },
  credentialType: { type: String, required: true },
  ipfsHash: { type: String, required: true },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ["Active", "Revoked"], default: "Active" },
});

export const CredentialRecord = mongoose.model<ICredentialRecord>("CredentialRecord", credentialRecordSchema);
