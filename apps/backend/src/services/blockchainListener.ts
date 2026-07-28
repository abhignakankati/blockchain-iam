import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AuditLog } from "../models/AuditLog.js";
import { UserProfile } from "../models/UserProfile.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const httpProvider = new ethers.JsonRpcProvider(env.RPC_URL);
const wsProvider = new ethers.WebSocketProvider(env.WS_RPC_URL);

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

type EventHandler = (details: Record<string, unknown>) => Promise<void>;

async function handleIdentityRegistered(details: Record<string, unknown>) {
  const wallet = (details.wallet as string)?.toLowerCase();
  const offChainRefHash = details.offChainRefHash as string;
  if (!wallet || !offChainRefHash) return;

  const result = await UserProfile.findOneAndUpdate(
    { offChainRefHash, status: "PendingOnChain" },
    { $set: { walletAddress: wallet, status: "PendingApproval" } }
  );

  if (result) {
    logger.info("Profile linked to wallet after on-chain registration", { wallet, offChainRefHash });
  } else {
    logger.warn("IdentityRegistered event did not match any PendingOnChain profile", { offChainRefHash });
  }
}

async function handleIdentityApproved(details: Record<string, unknown>) {
  const wallet = (details.wallet as string)?.toLowerCase();
  if (!wallet) return;

  const result = await UserProfile.findOneAndUpdate(
    { walletAddress: wallet, status: "PendingApproval" },
    { $set: { status: "Active" } }
  );

  if (result) {
    logger.info("Profile activated after on-chain approval", { wallet });
  }
}

const eventHandlers: Record<string, EventHandler> = {
  "IdentityContract.IdentityRegistered": handleIdentityRegistered,
  "IdentityContract.IdentityApproved": handleIdentityApproved,
};

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

    const handler = eventHandlers[`${contractName}.${parsed.name}`];
    if (handler) {
      await handler(details);
    }
  } catch (error) {
    logger.error(`Failed to index event: ${contractName}.${parsed.name}`, { error });
  }
}

/**
 * Live listening uses a WebSocket provider (eth_subscribe) rather than the
 * default HTTP polling provider (eth_newFilter/eth_getFilterChanges).
 * Hardhat's node can expire idle HTTP filters, which surfaces as a
 * "results is not iterable" crash from Ethers' filter-polling internals and
 * silently kills the subscription. WebSocket push-based subscriptions don't
 * have this failure mode.
 */
export function startListening(): void {
  for (const { name, address, abiPath } of trackedContracts) {
    const abi = loadAbi(abiPath);
    const contract = new ethers.Contract(address, abi, wsProvider);

    contract.on("*", async (payload: ethers.ContractEventPayload) => {
      const parsedLog = contract.interface.parseLog(payload.log);
      if (!parsedLog) return;

      await recordEvent(name, parsedLog, payload.log);
    });

    logger.info(`Listening for events on ${name} at ${address} (WebSocket)`);
  }
}

export { httpProvider as provider, trackedContracts, loadAbi, recordEvent };
