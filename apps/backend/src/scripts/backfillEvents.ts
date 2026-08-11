import mongoose from "mongoose";
import { logger } from "../config/logger.js";
import { connectDatabase } from "../config/database.js";
import { runBackfill } from "../services/blockchainListener.js";

/**
 * One-time (or re-runnable) manual backfill. Uses the same runBackfill()
 * function as the automatic reconnect-triggered and periodic in-process
 * backfills, so behavior can never diverge between manual and automatic
 * recovery paths.
 */
async function main() {
  await connectDatabase();

  logger.info("Starting manual backfill...");
  await runBackfill();
  logger.info("Backfill complete");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((error) => {
  logger.error("Backfill failed", { error });
  process.exit(1);
});
