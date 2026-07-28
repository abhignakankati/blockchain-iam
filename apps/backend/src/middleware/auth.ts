import { Request, Response, NextFunction } from "express";
import passport from "../config/passport.js";
import { ethers } from "ethers";
import { env } from "../config/env.js";
import identityAbi from "../contracts/abis/IdentityContract.json" with { type: "json" };

declare global {
  namespace Express {
    interface User {
      address: string;
    }
  }
}

export const requireAuth = passport.authenticate("jwt", { session: false });

const provider = new ethers.JsonRpcProvider(env.RPC_URL);
const identityContract = new ethers.Contract(env.IDENTITY_CONTRACT_ADDRESS, identityAbi.abi, provider);

export async function requireActiveIdentity(req: Request, res: Response, next: NextFunction) {
  const address = req.user?.address;
  if (!address) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const isActive = await identityContract.isActive(address);
    if (!isActive) {
      return res.status(403).json({ error: "Identity is not active" });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: "Failed to verify identity status" });
  }
}

export function requireRole(roleName: "ADMIN_ROLE" | "ISSUER_ROLE" | "VERIFIER_ROLE") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const address = req.user?.address;
    if (!address) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const roleHash = await identityContract[roleName]();
      const hasRole = await identityContract.hasRole(roleHash, address);
      if (!hasRole) {
        return res.status(403).json({ error: `Requires ${roleName}` });
      }
      next();
    } catch (error) {
      return res.status(500).json({ error: "Failed to verify role" });
    }
  };
}
