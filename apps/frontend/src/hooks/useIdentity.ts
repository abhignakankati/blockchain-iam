import { useQuery } from "@tanstack/react-query";
import { BrowserProvider, Contract } from "ethers";
import { CONTRACTS } from "@/lib/contracts";
import { useAuth } from "@/context/AuthContext";

export type IdentityStatus = "None" | "Pending" | "Active" | "Suspended" | "Revoked";
export type Role = "admin" | "issuer" | "verifier" | "user";

const STATUSES: IdentityStatus[] = ["None", "Pending", "Active", "Suspended", "Revoked"];

/** Contract handle: read-only via the wallet's provider, or signer-backed for transactions. */
export async function getIdentityContract(withSigner = false) {
  const provider = new BrowserProvider(window.ethereum!);
  const runner = withSigner ? await provider.getSigner() : provider;
  return new Contract(CONTRACTS.identity.address, CONTRACTS.identity.abi, runner);
}

export function errMsg(err: unknown): string {
  const e = err as { shortMessage?: string; message?: string; response?: { data?: { error?: unknown } } };
  const apiErr = e.response?.data?.error;
  if (apiErr) return typeof apiErr === "string" ? apiErr : JSON.stringify(apiErr);
  return e.shortMessage ?? e.message ?? "Something went wrong";
}

/** Reads this wallet's on-chain status and role. The contract is the source of truth. */
export function useIdentity() {
  const { address } = useAuth();
  return useQuery({
    queryKey: ["identity", address],
    enabled: !!address,
    refetchInterval: 5000,
    queryFn: async () => {
      const c = await getIdentityContract();
      const id = await c.getIdentity(address);
      const status = STATUSES[Number(id.status)];
      const [isAdmin, isIssuer, isVerifier] = await Promise.all([
        c.ADMIN_ROLE().then((r: string) => c.hasRole(r, address)),
        c.ISSUER_ROLE().then((r: string) => c.hasRole(r, address)),
        c.VERIFIER_ROLE().then((r: string) => c.hasRole(r, address)),
      ]);
      const role: Role = isAdmin ? "admin" : isIssuer ? "issuer" : isVerifier ? "verifier" : "user";
      return { status, role };
    },
  });
}
