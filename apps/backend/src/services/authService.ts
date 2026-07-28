import { SiweMessage, generateNonce } from "siwe";
import jwt from "jsonwebtoken";
import { Nonce } from "../models/Nonce.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

/**
 * Generates and persists a fresh nonce for a given wallet address to begin
 * the SIWE login flow. The client embeds this nonce into the SIWE message
 * it asks the user to sign.
 */
export async function issueNonce(address: string): Promise<string> {
  const nonce = generateNonce();

  await Nonce.create({ nonce, address: address.toLowerCase() });

  return nonce;
}

interface VerifyResult {
  success: boolean;
  address?: string;
  token?: string;
  error?: string;
}

/**
 * Verifies a signed SIWE message against a previously issued nonce, and on
 * success issues a JWT. The nonce document is deleted immediately upon
 * successful verification — this is what makes each nonce genuinely
 * one-time-use, preventing replay of the same signature.
 */
export async function verifySiweSignature(message: string, signature: string): Promise<VerifyResult> {
  try {
    const siweMessage = new SiweMessage(message);

    const storedNonce = await Nonce.findOne({ nonce: siweMessage.nonce });
    if (!storedNonce) {
      return { success: false, error: "Nonce not found, expired, or already used" };
    }

    if (storedNonce.address !== siweMessage.address.toLowerCase()) {
      return { success: false, error: "Nonce does not match the signing address" };
    }

    const verification = await siweMessage.verify({
      signature,
      domain: env.SIWE_DOMAIN,
      nonce: siweMessage.nonce,
    });

    if (!verification.success) {
      return { success: false, error: "Signature verification failed" };
    }

    // Delete immediately - a nonce is single-use regardless of verification outcome path
    await Nonce.deleteOne({ nonce: siweMessage.nonce });

    const address = siweMessage.address.toLowerCase();
    const token = jwt.sign({ sub: address }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRY as jwt.SignOptions["expiresIn"] });

    logger.info("SIWE login successful", { address });

    return { success: true, address, token };
  } catch (error) {
    logger.error("SIWE verification error", { error });
    return { success: false, error: "Verification failed due to an internal error" };
  }
}
