import { randomBytes, createHash } from "crypto";
import { ethers } from "ethers";
import { DelegationGrant } from "../models/DelegationGrant.js";
import { CredentialRecord } from "../models/CredentialRecord.js";
import { provider, loadAbi } from "./blockchainListener.js";
import { env } from "../config/env.js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface CreateGrantResult {
  token: string; // shown to the caller exactly once - never stored raw
  expiresAt: Date;
}

/**
 * Creates a delegation grant for a credential. Only the credential's
 * subject or issuer may create one, matching the synopsis's "the student
 * or institution authorizes a third party" requirement. Returns the raw
 * token exactly once - only its hash is ever persisted.
 */
export async function createDelegationGrant(
  credentialId: string,
  requesterAddress: string,
  durationHours: number
): Promise<CreateGrantResult> {
  const record = await CredentialRecord.findOne({ credentialId });
  if (!record) {
    throw new Error("Credential not found");
  }

  const isAuthorized = record.subject === requesterAddress || record.issuer === requesterAddress;
  if (!isAuthorized) {
    throw new Error("Only the credential's subject or issuer may create a delegation grant");
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

  await DelegationGrant.create({
    credentialId,
    grantedBy: requesterAddress,
    tokenHash,
    expiresAt,
  });

  return { token, expiresAt };
}

interface VerificationResult {
  valid: boolean;
  credentialType?: string;
  issuer?: string;
  subject?: string;
  issuedAt?: Date;
  expiresAt?: Date | null;
  error?: string;
}

/**
 * Verifies a credential using a delegation token. Checks the token itself
 * (exists, not expired, not revoked) purely off-chain, but the actual
 * validity result always comes from a live on-chain isValid() call - the
 * token only grants permission to check, it never fabricates a result.
 */
export async function verifyWithDelegationToken(token: string): Promise<VerificationResult> {
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const grant = await DelegationGrant.findOne({ tokenHash });
  if (!grant) {
    return { valid: false, error: "Invalid or unknown verification token" };
  }
  if (grant.revoked) {
    return { valid: false, error: "This verification link has been revoked" };
  }
  if (grant.expiresAt < new Date()) {
    return { valid: false, error: "This verification link has expired" };
  }

  const record = await CredentialRecord.findOne({ credentialId: grant.credentialId });
  if (!record) {
    return { valid: false, error: "Credential record not found" };
  }

  const abi = loadAbi("CredentialContract.json");
  const contract = new ethers.Contract(env.CREDENTIAL_CONTRACT_ADDRESS, abi, provider);
  const isValidOnChain: boolean = await contract.isValid(grant.credentialId);

  return {
    valid: isValidOnChain,
    credentialType: record.credentialType,
    issuer: record.issuer,
    subject: record.subject,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  };
}

/**
 * Revokes a delegation grant early. Only the original granter may revoke.
 */
export async function revokeDelegationGrant(credentialId: string, requesterAddress: string): Promise<void> {
  const result = await DelegationGrant.updateMany(
    { credentialId, grantedBy: requesterAddress, revoked: false },
    { $set: { revoked: true } }
  );

  if (result.matchedCount === 0) {
    throw new Error("No active delegation grants found for this credential from this account");
  }
}
