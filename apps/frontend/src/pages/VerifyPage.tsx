import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmt } from "@/hooks/useCredentials";

interface Result { valid: boolean; credentialType?: string; issuer?: string; subject?: string; issuedAt?: string; error?: string }

/** Public page: no wallet or account needed. Always reflects the live on-chain status. */
export function VerifyPage() {
  const { token } = useParams();
  const { data, isLoading, error } = useQuery<Result>({
    queryKey: ["verify", token],
    queryFn: async () => (await api.get(`/api/delegation/verify/${token}`)).data,
    retry: false,
  });

  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Credential verification</h1>
      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Checking the blockchain…</p>}
      {error && <p className="mt-6 text-sm text-destructive">Couldn't reach the verification service.</p>}
      {data && (
        <div className={`mt-8 rounded-lg border p-6 text-left ${data.valid ? "border-primary bg-accent" : "border-destructive bg-destructive/5"}`}>
          <p className={`text-lg font-semibold ${data.valid ? "text-primary" : "text-destructive"}`}>
            {data.valid ? "✓ Valid credential" : "✗ Not valid"}
          </p>
          {data.error && <p className="mt-2 text-sm">{data.error}</p>}
          {data.credentialType && <p className="mt-3 text-sm"><span className="text-muted-foreground">Type:</span> {data.credentialType}</p>}
          {data.issuer && <p className="break-all text-sm"><span className="text-muted-foreground">Issuer:</span> <span className="font-mono text-xs">{data.issuer}</span></p>}
          {data.subject && <p className="break-all text-sm"><span className="text-muted-foreground">Holder:</span> <span className="font-mono text-xs">{data.subject}</span></p>}
          {data.issuedAt && <p className="text-sm"><span className="text-muted-foreground">Issued:</span> {fmt(data.issuedAt)}</p>}
        </div>
      )}
    </div>
  );
}
