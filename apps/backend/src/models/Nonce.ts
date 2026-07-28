import mongoose, { Schema, Document } from "mongoose";

/**
 * A one-time-use nonce issued for SIWE login. TTL-indexed so MongoDB
 * automatically deletes expired, unused nonces — no manual cleanup job
 * needed. Deleting the document on successful verification (rather than
 * marking it "used") is what actually prevents replay of the same signed
 * message twice.
 */
export interface INonce extends Document {
  nonce: string;
  address: string;
  createdAt: Date;
}

const nonceSchema = new Schema<INonce>({
  nonce: { type: String, required: true, unique: true },
  address: { type: String, required: true, lowercase: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }, // 5-minute TTL
});

export const Nonce = mongoose.model<INonce>("Nonce", nonceSchema);
