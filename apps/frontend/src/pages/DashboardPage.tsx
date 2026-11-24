import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useIdentity } from "@/hooks/useIdentity";

const BLURB = {
  admin: "Approve registrations and oversee the system.",
  issuer: "Issue and revoke credentials, and manage your own.",
  verifier: "Verify credentials using shared links.",
  user: "View your credentials and share them for verification.",
} as const;

export function DashboardPage() {
  const { address } = useAuth();
  const { data } = useIdentity();
  const tiles = [
    ...(data?.role === "issuer" ? [{ to: "/issuer", title: "Issue credentials", text: "Upload a document and issue it on-chain." }] : []),
    { to: "/credentials", title: "My credentials", text: "View yours and create shareable verification links." },
    { to: "/access", title: "Resource access", text: "Request access and handle approvals." },
  ];
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
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="rounded-lg border border-border bg-card p-5 transition hover:border-primary">
            <p className="font-medium">{t.title} →</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
