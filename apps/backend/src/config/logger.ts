import winston from "winston";
import { env } from "./env.js";

/**
 * Central Winston logger. Logs to console always; also logs to files in
 * production so deployed environments (Render) retain history beyond
 * whatever the platform's own log retention provides.
 */
const isProduction = env.NODE_ENV === "production";

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "blockchain-iam-backend" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    ...(isProduction
      ? [
          new winston.transports.File({ filename: "logs/error.log", level: "error" }),
          new winston.transports.File({ filename: "logs/combined.log" }),
        ]
      : []),
  ],
});
