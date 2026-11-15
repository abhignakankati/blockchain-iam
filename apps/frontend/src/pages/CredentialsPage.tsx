import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { errMsg } from "@/hooks/useIdentity";
import { StatusBadge, fmt, type Cred } from "@/hooks/useCredentials";

export function CredentialsPage() {
  const [hours, setHours] = useState(48);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const mine = useQuery<Cred[]>({
    queryKey: ["mine"],
    queryFn: async () => (await api.get("/api/credentials/mine")).data,
    refetchInterval: 5000,
  });

  const share = useMutation({
    mutationFn: async (credentialId: string) => {
      const { data } = await api.post("/api/delegation/grant", { credentialId, durationHours: hours });
      return { credentialId, url: `${window.location.origin}/verify/${data.token}` };
    },
    onSuccess: ({ credentialId, url }) => setLinks((l) => ({ ...l, [credentialId]: url })),
  });

  const copy = async (id: string) => {
    await navigator.clipboard.writeText(links[id]);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My credentials</h1>
          <p className="mt-2 text-sm text-muted-foreground">Share a time-limited link so someone can verify a credential without an account.</p>
        </div>
        <label className="text-sm">Link valid for
          <select className="ml-2 rounded-lg border border-border bg-background px-2 py-1" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={24}>24 hours</option><option value={48}>48 hours</option><option value={168}>7 days</option>
          </select>
        </label>
      </div>

      {mine.isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
      {mine.data?.length === 0 && (
        <div className="mt-8 rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No credentials yet.</div>
      )}
      {share.error && <p className="mt-4 text-sm text-destructive">{errMsg(share.error)}</p>}

      <ul className="mt-6 space-y-3">
        {mine.data?.map((c) => (
          <li key={c.credentialId} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">{c.credentialType} <StatusBadge status={c.status} /></p>
                <p className="truncate font-mono text-xs text-muted-foreground">Issuer {c.issuer}</p>
                <p className="text-xs text-muted-foreground">
                  Issued {fmt(c.issuedAt)} · Expires {fmt(c.expiresAt)} ·{" "}
                  <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://gateway.pinata.cloud/ipfs/${c.ipfsHash}`}>Document</a>
                </p>
              </div>
              {c.status === "Active" && (
                <Button size="sm" variant="outline" disabled={share.isPending} onClick={() => share.mutate(c.credentialId)}>
                  {share.isPending && share.variables === c.credentialId ? "Creating…" : "Share link"}
                </Button>
              )}
            </div>
            {links[c.credentialId] && (
              <div className="mt-3 flex items-center gap-2">
                <input readOnly value={links[c.credentialId]} className="w-full rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-xs" />
                <Button size="sm" onClick={() => copy(c.credentialId)}>{copied === c.credentialId ? "Copied ✓" : "Copy"}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
