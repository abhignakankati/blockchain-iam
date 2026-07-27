import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AuditLog } from "../models/AuditLog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const provider = new ethers.JsonRpcProvider(env.RPC_URL);

interface TrackedContract {
  name: string;
  address: string;
  abiPath: string;
}

const trackedContracts: TrackedContract[] = [
  { name: "IdentityContract", address: env.IDENTITY_CONTRACT_ADDRESS, abiPath: "IdentityContract.json" },
  { name: "CredentialContract", address: env.CREDENTIAL_CONTRACT_ADDRESS, abiPath: "CredentialContract.json" },
  {
    name: "AccessControlContract",
    address: env.ACCESS_CONTROL_CONTRACT_ADDRESS,
    abiPath: "AccessControlContract.json",
  },
];

function loadAbi(fileName: string): ethers.InterfaceAbi {
  const fullPath = join(__dirname, "..", "contracts", "abis", fileName);
  const artifact = JSON.parse(readFileSync(fullPath, "utf-8"));
  return artifact.abi;
}

function extractFields(fragment: ethers.EventFragment, args: ethers.Result) {
  const details: Record<string, unknown> = {};
  let actor: string | undefined;
  let resourceId: string | undefined;

  for (const input of fragment.inputs) {
    const rawValue = args[input.name as keyof typeof args];
    const value = typeof rawValue === "bigint" ? rawValue.toString() : rawValue;
    details[input.name] = value;

    if (!actor && input.type === "address") {
      actor = value as string;
    }
    if (!resourceId && input.type === "bytes32") {
      resourceId = value as string;
    }
  }

  return { details, actor, resourceId };
}

async function recordEvent(
  contractName: string,
  parsed: { name: string; args: ethers.Result; fragment: ethers.EventFragment },
  log: { transactionHash: string; blockNumber: number; index: number; getBlock: () => Promise<{ timestamp: number }> }
) {
  try {
    const { details, actor, resourceId } = extractFields(parsed.fragment, parsed.args);
    const block = await log.getBlock();

    await AuditLog.findOneAndUpdate(
      { transactionHash: log.transactionHash, logIndex: log.index },
      {
        $setOnInsert: {
          contractName,
          eventName: parsed.name,
          transactionHash: log.transactionHash,
          logIndex: log.index,
          blockNumber: log.blockNumber,
          actor,
          resourceId,
          details,
          timestamp: new Date(block.timestamp * 1000),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    logger.info(`Indexed event: ${contractName}.${parsed.name}`, { transactionHash: log.transactionHash });
  } catch (error) {
    logger.error(`Failed to index event: ${contractName}.${parsed.name}`, { error });
  }
}

export function startListening(): void {
  for (const { name, address, abiPath } of trackedContracts) {
    const abi = loadAbi(abiPath);
    const contract = new ethers.Contract(address, abi, provider);

    contract.on("*", async (payload: ethers.ContractEventPayload) => {
      const parsedLog = contract.interface.parseLog(payload.log);
      if (!parsedLog) return;

      await recordEvent(name, parsedLog, payload.log);
    });

    logger.info(`Listening for events on ${name} at ${address}`);
  }
}

export { provider, trackedContracts, loadAbi, recordEvent };
