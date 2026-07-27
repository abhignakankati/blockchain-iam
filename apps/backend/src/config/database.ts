import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Connects to MongoDB. Called once at server startup. Exits the process on
 * failure rather than starting a server that can't actually persist data.
 */
export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(env.MONGO_URI);
    logger.info("MongoDB connected successfully");
  } catch (error) {
    logger.error("MongoDB connection failed", { error });
    process.exit(1);
  }
}
