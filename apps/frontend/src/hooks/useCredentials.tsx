import { BrowserProvider, Contract } from "ethers";
import { CONTRACTS } from "@/lib/contracts";

export interface Cred {
  credentialId: string; subject: string; issuer: string; credentialType: string;
  ipfsHash: string; issuedAt: string; expiresAt: string | null; status: "Active" | "Revoked";
}

export async function getCredentialContract(withSigner = false) {
  const provider = new BrowserProvider(window.ethereum!);
  const runner = withSigner ? await provider.getSigner() : provider;
  return new Contract(CONTRACTS.credential.address, CONTRACTS.credential.abi, runner);
}

export const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "Never");

export function StatusBadge({ status }: { status: string }) {
  const ok = status === "Active";
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${ok ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive"}`}>
      {status}
    </span>
  );
}
