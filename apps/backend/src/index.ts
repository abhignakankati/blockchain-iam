import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDatabase } from "./config/database.js";
import { startListening } from "./services/blockchainListener.js";
import passport from "./config/passport.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import { requireAuth, requireActiveIdentity } from "./middleware/auth.js";

async function main() {
  await connectDatabase();

  startListening();

  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(passport.initialize());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);

  app.get("/api/me", requireAuth, requireActiveIdentity, (req, res) => {
    res.json({ address: req.user?.address, status: "active" });
  });

  app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
  });
}

main().catch((error) => {
  logger.error("Fatal startup error", { error });
  process.exit(1);
});
