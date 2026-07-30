import mongoose, { Schema, Document } from "mongoose";

/**
 * A time-bound, revocable grant allowing an external party (who may not
 * hold any identity in the system) to verify a specific credential via a
 * shareable link/token - without ever needing a wallet or SIWE login.
 * Only tokenHash (SHA-256 of the actual token) is stored, never the raw
 * token itself - same security posture as password storage. The raw
 * token is shown to the granter exactly once, at creation time.
 */
export interface IDelegationGrant extends Document {
  credentialId: string;
  grantedBy: string; // wallet address of the credential's subject or issuer
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  createdAt: Date;
}

const delegationGrantSchema = new Schema<IDelegationGrant>({
  credentialId: { type: String, required: true, index: true },
  grantedBy: { type: String, required: true, lowercase: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revoked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const DelegationGrant = mongoose.model<IDelegationGrant>("DelegationGrant", delegationGrantSchema);
