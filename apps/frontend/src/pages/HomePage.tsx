import { useAuth } from "@/context/AuthContext";

export function HomePage() {
  const { isAuthenticated, address } = useAuth();

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">
        Blockchain-Based Identity and Access Management
      </h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        Secure credential verification and controlled resource access,
        backed by on-chain identity, role-based and attribute-based access
        control, and an immutable audit trail.
      </p>

      {isAuthenticated ? (
        <div className="mt-8 rounded-lg border border-accent-border bg-accent-bg p-6">
          <p className="text-sm text-muted-foreground">Connected as</p>
          <p className="mt-1 font-mono text-sm">{address}</p>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Connect your wallet using the button in the top right to get started.
          </p>
        </div>
      )}
    </div>
  );
}
