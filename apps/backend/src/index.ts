import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDatabase } from "./config/database.js";
import { startListening } from "./services/blockchainListener.js";

async function main() {
  await connectDatabase();

  startListening();

  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
  });
}

main().catch((error) => {
  logger.error("Fatal startup error", { error });
  process.exit(1);
});
