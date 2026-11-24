import { BrowserProvider, Contract, decodeBytes32String } from "ethers";
import { CONTRACTS } from "@/lib/contracts";

export interface Resource { resourceId: string; owner: string; sensitivityLevel: "Normal" | "Sensitive" | "Critical" }
export interface AccessReq { resourceId: string; requester: string; status: "Pending" | "Granted" | "Denied"; currentlyGranted: boolean }

export async function getAccessContract(withSigner = false) {
  const provider = new BrowserProvider(window.ethereum!);
  const runner = withSigner ? await provider.getSigner() : provider;
  return new Contract(CONTRACTS.accessControl.address, CONTRACTS.accessControl.abi, runner);
}

/** Resource ids are bytes32; names registered as short strings decode back to readable text. */
export function resourceName(id: string): string {
  try { return decodeBytes32String(id); } catch { return `${id.slice(0, 10)}…`; }
}
