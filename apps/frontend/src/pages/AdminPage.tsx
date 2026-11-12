import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { getIdentityContract, errMsg, useIdentity } from "@/hooks/useIdentity";

interface Profile { _id: string; name: string; email: string; department?: string; walletAddress?: string }

export function AdminPage() {
  const qc = useQueryClient();
  const { data: identity } = useIdentity();
  const [approved, setApproved] = useState<string[]>([]); // hides rows until the indexer catches up

  const pending = useQuery<Profile[]>({
    queryKey: ["pending"],
    queryFn: async () => (await api.get("/api/users/pending")).data,
    refetchInterval: 5000,
    enabled: identity?.role === "admin",
  });

  const approve = useMutation({
    mutationFn: async (wallet: string) => {
      const contract = await getIdentityContract(true);
      const tx = await contract.approveIdentity(wallet);
      await tx.wait();
      return wallet;
    },
    onSuccess: (wallet) => {
      setApproved((a) => [...a, wallet]);
      qc.invalidateQueries({ queryKey: ["pending"] });
    },
  });

  if (identity && identity.role !== "admin") {
    return <p className="mx-auto max-w-3xl px-6 py-12 text-destructive">This page is for administrators only.</p>;
  }

  const rows = (pending.data ?? []).filter((p) => p.walletAddress && !approved.includes(p.walletAddress));
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Pending approvals</h1>
      <p className="mt-2 text-sm text-muted-foreground">Approving sends a transaction from your wallet to the IdentityContract.</p>

      {approve.error && <p className="mt-4 text-sm text-destructive">{errMsg(approve.error)}</p>}
      {pending.isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
      {pending.data && rows.length === 0 && (
        <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No one is waiting for approval.
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {rows.map((p) => (
          <li key={p._id} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
            <div className="min-w-0">
              <p className="font-medium">{p.name} <span className="text-sm font-normal text-muted-foreground">· {p.email}</span></p>
              <p className="truncate font-mono text-xs text-muted-foreground">{p.walletAddress}</p>
              {p.department && <p className="text-xs text-muted-foreground">{p.department}</p>}
            </div>
            <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(p.walletAddress!)}>
              {approve.isPending && approve.variables === p.walletAddress ? "Approving…" : "Approve"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
