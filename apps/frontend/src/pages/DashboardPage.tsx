import { useAuth } from "@/context/AuthContext";
import { useIdentity } from "@/hooks/useIdentity";

const BLURB = {
  admin: "Approve registrations and oversee the system.",
  issuer: "Issue and revoke credentials. (Issuer tools coming next.)",
  verifier: "Verify credentials. (Verifier tools coming next.)",
  user: "View your credentials and request access. (Coming next.)",
} as const;

export function DashboardPage() {
  const { address } = useAuth();
  const { data } = useIdentity();
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-6 rounded-lg border border-accent-border bg-accent-bg p-6">
        <p className="text-sm text-muted-foreground">Signed in as</p>
        <p className="mt-1 break-all font-mono text-sm">{address}</p>
        {data && (
          <p className="mt-4 text-sm">
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{data.role}</span>
            <span className="ml-3 text-muted-foreground">{BLURB[data.role]}</span>
          </p>
        )}
      </div>
    </div>
  );
}
