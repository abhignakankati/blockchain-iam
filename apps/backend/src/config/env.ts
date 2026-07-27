import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/**
 * Validates all required environment variables at startup. If anything is
 * missing or malformed, the process exits immediately with a clear error
 * instead of failing confusingly later (e.g. a blank contract address
 * silently causing every blockchain call to revert).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  MONGO_URI: z.string().min(1, "MONGO_URI is required"),

  RPC_URL: z.string().min(1, "RPC_URL is required"),
  IDENTITY_CONTRACT_ADDRESS: z.string().min(1, "IDENTITY_CONTRACT_ADDRESS is required"),
  CREDENTIAL_CONTRACT_ADDRESS: z.string().min(1, "CREDENTIAL_CONTRACT_ADDRESS is required"),
  ACCESS_CONTROL_CONTRACT_ADDRESS: z.string().min(1, "ACCESS_CONTROL_CONTRACT_ADDRESS is required"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
