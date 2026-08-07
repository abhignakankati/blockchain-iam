import { ethers } from "ethers";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AuditLog } from "../models/AuditLog.js";
import { UserProfile } from "../models/UserProfile.js";
import { CredentialRecord } from "../models/CredentialRecord.js";
import { ResourceRecord, SensitivityLevel } from "../models/ResourceRecord.js";
import { AccessRequestRecord, AccessRequestStatus } from "../models/AccessRequestRecord.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const httpProvider = new ethers.JsonRpcProvider(env.RPC_URL);

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

async function handleCredentialIssued(details: Record<string, unknown>) {
  const credentialId = details.credentialId as string;
  const subject = (details.subject as string)?.toLowerCase();
  const issuer = (details.issuer as string)?.toLowerCase();
  const documentHash = details.documentHash as string;
  const expiresAtRaw = details.expiresAt as string;

  if (!credentialId || !subject || !issuer) return;

  const expiresAt = expiresAtRaw && expiresAtRaw !== "0" ? new Date(Number(expiresAtRaw) * 1000) : null;

  let credentialType = "unknown";
  let ipfsHash = "";

  try {
    const abi = loadAbi("CredentialContract.json");
    const contract = new ethers.Contract(env.CREDENTIAL_CONTRACT_ADDRESS, abi, httpProvider);
    const fullRecord = await contract.getCredential(credentialId);
    credentialType = fullRecord.credentialType;
    ipfsHash = fullRecord.ipfsHash;
  } catch (error) {
    logger.error("Failed to fetch full credential record for indexing", { credentialId, error });
  }

  await CredentialRecord.findOneAndUpdate(
    { credentialId },
    {
      $setOnInsert: {
        credentialId,
        subject,
        issuer,
        documentHash,
        credentialType,
        ipfsHash,
        issuedAt: new Date(),
        expiresAt,
        status: "Active",
      },
    },
    { upsert: true }
  );

  logger.info("Credential record indexed after on-chain issuance", { credentialId, subject, issuer, credentialType });
}

async function handleCredentialRevoked(details: Record<string, unknown>) {
  const credentialId = details.credentialId as string;
  if (!credentialId) return;

  const result = await CredentialRecord.findOneAndUpdate(
    { credentialId, status: "Active" },
    { $set: { status: "Revoked" } }
  );

  if (result) {
    logger.info("Credential record marked revoked", { credentialId });
  }
}

const SENSITIVITY_LEVELS: SensitivityLevel[] = ["Normal", "Sensitive", "Critical"];
const REQUEST_STATUSES: AccessRequestStatus[] = ["Pending", "Pending", "Granted", "Denied"];

async function handleResourceRegistered(details: Record<string, unknown>) {
  const resourceId = details.resourceId as string;
  const owner = (details.owner as string)?.toLowerCase();
  const sensitivityLevelRaw = Number(details.sensitivityLevel);

  if (!resourceId || !owner) return;

  await ResourceRecord.findOneAndUpdate(
    { resourceId },
    {
      $setOnInsert: {
        resourceId,
        owner,
        sensitivityLevel: SENSITIVITY_LEVELS[sensitivityLevelRaw] ?? "Normal",
        requiredRole: "",
        requiredAttributeKey: "",
        requiredAttributeValue: "",
        approver1: "",
        approver2: "",
        registeredAt: new Date(),
      },
    },
    { upsert: true }
  );

  logger.info("Resource indexed after on-chain registration", { resourceId, owner });
}

async function handleApproversUpdated(details: Record<string, unknown>) {
  const resourceId = details.resourceId as string;
  const approver1 = (details.approver1 as string)?.toLowerCase() ?? "";
  const approver2 = (details.approver2 as string)?.toLowerCase() ?? "";
  if (!resourceId) return;

  await ResourceRecord.findOneAndUpdate({ resourceId }, { $set: { approver1, approver2 } });

  logger.info("Resource approvers updated in index", { resourceId });
}

async function handleAccessRequested(details: Record<string, unknown>) {
  const resourceId = details.resourceId as string;
  const requester = (details.requester as string)?.toLowerCase();
  const initialStatusRaw = Number(details.initialStatus);
  if (!resourceId || !requester) return;

  const status = REQUEST_STATUSES[initialStatusRaw] ?? "Pending";

  await AccessRequestRecord.findOneAndUpdate(
    { resourceId, requester },
    {
      $set: {
        status,
        requestedAt: new Date(),
        decidedAt: status === "Pending" ? null : new Date(),
        currentlyGranted: status === "Granted",
      },
    },
    { upsert: true }
  );

  logger.info("Access request indexed", { resourceId, requester, status });
}

async function handleAccessGranted(details: Record<string, unknown>) {
  const resourceId = details.resourceId as string;
  const requester = (details.requester as string)?.toLowerCase();
  if (!resourceId || !requester) return;

  await AccessRequestRecord.findOneAndUpdate(
    { resourceId, requester },
    { $set: { status: "Granted", decidedAt: new Date(), currentlyGranted: true } }
  );

  logger.info("Access request marked Granted", { resourceId, requester });
}

async function handleAccessDenied(details: Record<string, unknown>) {
  const resourceId = details.resourceId as string;
  const requester = (details.requester as string)?.toLowerCase();
  if (!resourceId || !requester) return;

  await AccessRequestRecord.findOneAndUpdate(
    { resourceId, requester },
    { $set: { status: "Denied", decidedAt: new Date(), currentlyGranted: false } }
  );

  logger.info("Access request marked Denied", { resourceId, requester });
}

async function handleAccessRevoked(details: Record<string, unknown>) {
  const resourceId = details.resourceId as string;
  const wallet = (details.wallet as string)?.toLowerCase();
  if (!resourceId || !wallet) return;

  await AccessRequestRecord.findOneAndUpdate(
    { resourceId, requester: wallet },
    { $set: { currentlyGranted: false } }
  );

  logger.info("Access marked revoked in index", { resourceId, wallet });
}

const eventHandlers: Record<string, EventHandler> = {
  "IdentityContract.IdentityRegistered": handleIdentityRegistered,
  "IdentityContract.IdentityApproved": handleIdentityApproved,
  "CredentialContract.CredentialIssued": handleCredentialIssued,
  "CredentialContract.CredentialRevoked": handleCredentialRevoked,
  "AccessControlContract.ResourceRegistered": handleResourceRegistered,
  "AccessControlContract.ApproversUpdated": handleApproversUpdated,
  "AccessControlContract.AccessRequested": handleAccessRequested,
  "AccessControlContract.AccessGranted": handleAccessGranted,
  "AccessControlContract.AccessDenied": handleAccessDenied,
  "AccessControlContract.AccessRevoked": handleAccessRevoked,
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

    const handler = eventHandlers[`${contractName}.${parsed.name}`];
    if (handler) {
      await handler(details);
    }
  } catch (error) {
    logger.error(`Failed to index event: ${contractName}.${parsed.name}`, { error });
  }
}

export async function runBackfill(): Promise<void> {
  for (const { name, address, abiPath } of trackedContracts) {
    const abi = loadAbi(abiPath);
    const contract = new ethers.Contract(address, abi, httpProvider);

    const eventFragments = contract.interface.fragments.filter(
      (fragment): fragment is ethers.EventFragment => fragment.type === "event"
    );

    for (const fragment of eventFragments) {
      const logs = await contract.queryFilter(fragment.name, 0, "latest");

      for (const log of logs) {
        if (!("args" in log)) continue;
        await recordEvent(name, { name: fragment.name, args: log.args, fragment }, log as ethers.EventLog);
      }
    }
  }
}

/**
 * Connection strategy (revised): a single WebSocket connection for live
 * delivery, with NO custom manual reconnect logic. An earlier version
 * attempted reconnect-with-backoff on socket close/error, but this fought
 * with Ethers' own internal JsonRpcApiProvider retry behavior (visible as
 * "JsonRpcProvider failed to detect network..." log lines that come from
 * Ethers itself, not our code) - the two independent retry mechanisms
 * triggered each other's event handlers, producing a connection storm
 * that reached dozens of concurrent sockets within seconds during testing.
 *
 * Rather than add further locking to fully tame an interaction with
 * library internals we don't control, the simpler and more robust design
 * is: let the WebSocket connection be best-effort for low-latency live
 * updates, and rely on a frequent periodic backfill (every 60 seconds) as
 * the actual correctness guarantee. Worst case, an event is caught up to
 * 60 seconds late instead of instantly - but this can never cascade or
 * storm, and is trivially simple to reason about. A simpler, slightly
 * slower design beat a cleverer, fragile one here.
 */
function connectWebSocket(): void {
  const provider = new ethers.WebSocketProvider(env.WS_RPC_URL);
  for (const { name, address, abiPath } of trackedContracts) {
    const abi = loadAbi(abiPath);
    const contract = new ethers.Contract(address, abi, provider);

    contract.on("*", async (payload: ethers.ContractEventPayload) => {
      const parsedLog = contract.interface.parseLog(payload.log);
      if (!parsedLog) return;

      await recordEvent(name, parsedLog, payload.log);
    });
  }

  logger.info("WebSocket connection established for live event delivery (best-effort, no manual reconnect)");
}

function startPeriodicBackfill(intervalMs: number): void {
  setInterval(() => {
    runBackfill().catch((error) => {
      logger.error("Periodic safety-net backfill failed", { error });
    });
  }, intervalMs);
}

export function startListening(): void {
  connectWebSocket();
  startPeriodicBackfill(60 * 1000); // every 60 seconds - the actual correctness guarantee
  logger.info("Blockchain listener started (WebSocket best-effort + 60s periodic backfill as source of truth)");
}

export { httpProvider as provider, trackedContracts, loadAbi, recordEvent };
