import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { errMsg } from "@/hooks/useIdentity";
import { getAccessContract, resourceName, type AccessReq, type Resource } from "@/hooks/useAccess";

const TONE = { Normal: "bg-accent text-accent-foreground", Sensitive: "bg-yellow-100 text-yellow-800", Critical: "bg-destructive/10 text-destructive" };
const HINT = { Normal: "Granted automatically", Sensitive: "Needs 1 approval", Critical: "Needs 2 approvals" };

export function AccessPage() {
  const qc = useQueryClient();
  const [requested, setRequested] = useState<string[]>([]);
  const [decided, setDecided] = useState<string[]>([]);
  const poll = { refetchInterval: 5000 };

  const resources = useQuery<Resource[]>({ queryKey: ["resources"], queryFn: async () => (await api.get("/api/access/resources")).data, ...poll });
  const mine = useQuery<AccessReq[]>({ queryKey: ["my-requests"], queryFn: async () => (await api.get("/api/access/my-requests")).data, ...poll });
  const toApprove = useQuery<AccessReq[]>({ queryKey: ["to-approve"], queryFn: async () => (await api.get("/api/access/pending-for-me")).data, ...poll });

  const request = useMutation({
    mutationFn: async (id: string) => { await (await (await getAccessContract(true)).requestAccess(id)).wait(); return id; },
    onSuccess: (id) => { setRequested((r) => [...r, id]); qc.invalidateQueries({ queryKey: ["my-requests"] }); },
  });
  const decide = useMutation({
    mutationFn: async ({ r, approve }: { r: AccessReq; approve: boolean }) => {
      const c = await getAccessContract(true);
      await (await (approve ? c.approveAccess(r.resourceId, r.requester) : c.denyAccess(r.resourceId, r.requester))).wait();
      return `${r.resourceId}:${r.requester}`;
    },
    onSuccess: (key) => { setDecided((d) => [...d, key]); qc.invalidateQueries({ queryKey: ["to-approve"] }); },
  });

  const byResource = Object.fromEntries((mine.data ?? []).map((r) => [r.resourceId, r]));
  const approvals = (toApprove.data ?? []).filter((r) => !decided.includes(`${r.resourceId}:${r.requester}`));
  const nameOf = (id: string) => resourceName(id);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Resource access</h1>
      <p className="mt-2 text-sm text-muted-foreground">Access is decided by on-chain policy; sensitive resources also need approver sign-off.</p>
      {(request.error || decide.error) && <p className="mt-4 text-sm text-destructive">{errMsg(request.error ?? decide.error)}</p>}

      {approvals.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Waiting for your approval</h2>
          <ul className="mt-3 space-y-3">
            {approvals.map((r) => (
              <li key={`${r.resourceId}:${r.requester}`} className="flex items-center justify-between gap-4 rounded-lg border border-primary bg-accent-bg p-4">
                <div className="min-w-0">
                  <p className="font-medium">{nameOf(r.resourceId)}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">Requested by {r.requester}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ r, approve: true })}>Approve</Button>
                  <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ r, approve: false })}>Deny</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 text-xl font-semibold">Resources</h2>
      {resources.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No resources are registered yet.</p>}
      <ul className="mt-3 space-y-3">
        {resources.data?.map((res) => {
          const req = byResource[res.resourceId];
          const granted = req?.currentlyGranted;
          const pending = req?.status === "Pending" || requested.includes(res.resourceId);
          return (
            <li key={res.resourceId} className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
              <div>
                <p className="font-medium">{nameOf(res.resourceId)} <span className={`ml-2 rounded-md px-2 py-0.5 text-xs font-medium ${TONE[res.sensitivityLevel]}`}>{res.sensitivityLevel}</span></p>
                <p className="text-xs text-muted-foreground">{HINT[res.sensitivityLevel]}{req?.status === "Denied" && !granted ? " · Your last request was denied" : ""}</p>
              </div>
              {granted ? <span className="text-sm font-medium text-primary">✓ Access granted</span>
                : pending ? <span className="text-sm text-muted-foreground">Pending…</span>
                : <Button size="sm" disabled={request.isPending} onClick={() => request.mutate(res.resourceId)}>
                    {request.isPending && request.variables === res.resourceId ? "Requesting…" : "Request access"}
                  </Button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
