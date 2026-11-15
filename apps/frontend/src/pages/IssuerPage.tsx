import { useState } from "react";
import { isAddress } from "ethers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { errMsg, useIdentity } from "@/hooks/useIdentity";
import { getCredentialContract, StatusBadge, fmt, type Cred } from "@/hooks/useCredentials";

const input = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function IssuerPage() {
  const qc = useQueryClient();
  const { data: identity } = useIdentity();
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("");
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<string[]>([]);

  const issued = useQuery<Cred[]>({
    queryKey: ["issued"],
    queryFn: async () => (await api.get("/api/credentials/issued")).data,
    refetchInterval: 5000,
    enabled: identity?.role === "issuer",
  });

  const issue = useMutation({
    mutationFn: async () => {
      setStep("Uploading to IPFS…");
      const fd = new FormData();
      fd.append("file", file!);
      const { data } = await api.post("/api/credentials/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setStep("Confirm in your wallet…");
      const hash = String(data.documentHash).startsWith("0x") ? data.documentHash : `0x${data.documentHash}`;
      const exp = expires ? Math.floor(new Date(expires).getTime() / 1000) : 0;
      const c = await getCredentialContract(true);
      const tx = await c.issueCredential(subject.trim(), hash, type.trim(), data.ipfsHash, exp);
      setStep("Confirming on-chain…");
      await tx.wait();
    },
    onSuccess: () => {
      setSubject(""); setType(""); setExpires(""); setFile(null);
      qc.invalidateQueries({ queryKey: ["issued"] });
    },
    onSettled: () => setStep(null),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const c = await getCredentialContract(true);
      await (await c.revokeCredential(id)).wait();
      return id;
    },
    onSuccess: (id) => { setRevoked((r) => [...r, id]); qc.invalidateQueries({ queryKey: ["issued"] }); },
  });

  const submit = () => {
    setFormError(null);
    if (!isAddress(subject.trim())) return setFormError("Enter a valid wallet address for the recipient.");
    if (type.trim().length < 2) return setFormError("Enter a credential type, e.g. Degree Certificate.");
    if (!file) return setFormError("Choose a PDF or image to attach.");
    issue.mutate();
  };

  if (identity && identity.role !== "issuer") {
    return <p className="mx-auto max-w-3xl px-6 py-12 text-destructive">This page is for issuers only.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Issue credentials</h1>
      <p className="mt-2 text-sm text-muted-foreground">The document goes to IPFS; its hash is recorded on-chain from your wallet.</p>

      <div className="mt-8 space-y-4 rounded-lg border border-border bg-card p-6">
        <label className="block text-sm font-medium">Recipient wallet
          <input className={`${input} font-mono`} placeholder="0x…" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!!step} />
        </label>
        <label className="block text-sm font-medium">Credential type
          <input className={input} placeholder="Degree Certificate" value={type} onChange={(e) => setType(e.target.value)} disabled={!!step} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Expires (optional)
            <input type="date" className={input} value={expires} onChange={(e) => setExpires(e.target.value)} disabled={!!step} />
          </label>
          <label className="block text-sm font-medium">Document (PDF, PNG, JPEG, WebP)
            <input type="file" accept=".pdf,image/png,image/jpeg,image/webp" className={input} onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={!!step} />
          </label>
        </div>
        {step && <p className="text-sm font-medium text-primary">{step}</p>}
        {(formError || issue.error) && <p className="text-sm text-destructive">{formError ?? errMsg(issue.error)}</p>}
        {issue.isSuccess && !step && <p className="text-sm text-primary">✓ Credential issued.</p>}
        <Button onClick={submit} disabled={!!step} className="w-full">{step ? "Working…" : "Issue credential"}</Button>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Issued by you</h2>
      {revoke.error && <p className="mt-2 text-sm text-destructive">{errMsg(revoke.error)}</p>}
      {issued.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Nothing issued yet.</p>}
      <ul className="mt-4 space-y-3">
        {issued.data?.map((c) => {
          const isRevoked = c.status === "Revoked" || revoked.includes(c.credentialId);
          return (
            <li key={c.credentialId} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
              <div className="min-w-0">
                <p className="font-medium">{c.credentialType} <StatusBadge status={isRevoked ? "Revoked" : "Active"} /></p>
                <p className="truncate font-mono text-xs text-muted-foreground">To {c.subject}</p>
                <p className="text-xs text-muted-foreground">Issued {fmt(c.issuedAt)} · Expires {fmt(c.expiresAt)}</p>
              </div>
              {!isRevoked && (
                <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate(c.credentialId)}>
                  {revoke.isPending && revoke.variables === c.credentialId ? "Revoking…" : "Revoke"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
