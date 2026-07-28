import mongoose, { Schema, Document } from "mongoose";

export type ProfileStatus = "PendingOnChain" | "PendingApproval" | "Active" | "Suspended" | "Revoked";

export interface IUserProfile extends Document {
  offChainRefHash: string;
  walletAddress?: string;
  name: string;
  email: string;
  department?: string;
  status: ProfileStatus;
  createdAt: Date;
  updatedAt: Date;
}

const userProfileSchema = new Schema<IUserProfile>(
  {
    offChainRefHash: { type: String, required: true, unique: true },
    walletAddress: { type: String, lowercase: true, index: true, sparse: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    department: { type: String },
    status: {
      type: String,
      enum: ["PendingOnChain", "PendingApproval", "Active", "Suspended", "Revoked"],
      default: "PendingOnChain",
    },
  },
  { timestamps: true }
);

export const UserProfile = mongoose.model<IUserProfile>("UserProfile", userProfileSchema);
