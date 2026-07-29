import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  MONGO_URI: z.string().min(1, "MONGO_URI is required"),

  RPC_URL: z.string().min(1, "RPC_URL is required"),
  WS_RPC_URL: z.string().min(1, "WS_RPC_URL is required"),
  IDENTITY_CONTRACT_ADDRESS: z.string().min(1, "IDENTITY_CONTRACT_ADDRESS is required"),
  CREDENTIAL_CONTRACT_ADDRESS: z.string().min(1, "CREDENTIAL_CONTRACT_ADDRESS is required"),
  ACCESS_CONTROL_CONTRACT_ADDRESS: z.string().min(1, "ACCESS_CONTROL_CONTRACT_ADDRESS is required"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRY: z.string().default("1h"),

  SIWE_DOMAIN: z.string().default("localhost"),
  SIWE_URI: z.string().default("http://localhost:4000"),

  SERVER_SALT: z.string().min(32, "SERVER_SALT must be at least 32 characters"),

  PINATA_JWT: z.string().min(100, "PINATA_JWT is required and should be a long JWT"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
