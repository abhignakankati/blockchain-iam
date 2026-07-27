import mongoose from "mongoose";
import { logger } from "../config/logger.js";
import { connectDatabase } from "../config/database.js";
import { provider, trackedContracts, loadAbi, recordEvent } from "../services/blockchainListener.js";
import { ethers } from "ethers";

async function backfill() {
  await connectDatabase();

  for (const { name, address, abiPath } of trackedContracts) {
    const abi = loadAbi(abiPath);
    const contract = new ethers.Contract(address, abi, provider);

    const eventFragments = contract.interface.fragments.filter(
      (fragment): fragment is ethers.EventFragment => fragment.type === "event"
    );

    for (const fragment of eventFragments) {
      const logs = await contract.queryFilter(fragment.name, 0, "latest");
      logger.info(`Backfilling ${logs.length} "${fragment.name}" event(s) from ${name}`);

      for (const log of logs) {
        if (!("args" in log)) continue;

        await recordEvent(name, { name: fragment.name, args: log.args, fragment }, log as ethers.EventLog);
      }
    }
  }

  logger.info("Backfill complete");
  await mongoose.disconnect();
  process.exit(0);
}

backfill().catch((error) => {
  logger.error("Backfill failed", { error });
  process.exit(1);
});
