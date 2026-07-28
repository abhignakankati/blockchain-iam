import { ethers } from "ethers";
import mongoose from "mongoose";
import { UserProfile } from "../models/UserProfile.js";
import { env } from "../config/env.js";

interface RegistrationIntentInput {
  name: string;
  email: string;
  department?: string;
}

/**
 * Creates an off-chain profile record and computes the offChainRefHash the
 * user's wallet will submit on-chain via registerIdentity(). The hash is
 * derived from the profile's own MongoDB _id plus a server-wide salt, so a
 * leaked profile ID alone (e.g. via a support ticket) can't be used to
 * correlate a wallet address on a public block explorer without also
 * knowing the salt.
 */
export async function createRegistrationIntent(input: RegistrationIntentInput) {
  const profileId = new mongoose.Types.ObjectId();
  const offChainRefHash = ethers.keccak256(ethers.toUtf8Bytes(profileId.toString() + env.SERVER_SALT));

  const profile = await UserProfile.create({
    _id: profileId,
    offChainRefHash,
    name: input.name,
    email: input.email,
    department: input.department,
    status: "PendingOnChain",
  });

  return {
    profileId: profile._id.toString(),
    offChainRefHash,
    status: profile.status,
  };
}
