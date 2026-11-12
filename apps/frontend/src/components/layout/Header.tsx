import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Header() {
  const { address, isAuthenticated, isConnecting, error, connectAndSignIn, signOut } = useAuth();

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary" />
          <span className="text-lg font-semibold">Blockchain IAM</span>
        </div>

        <div className="flex items-center gap-4">
          {error && <span className="text-sm text-destructive">{error}</span>}

          {isAuthenticated && address ? (
            <div className="flex items-center gap-3">
              <span className="rounded-md bg-accent-bg border border-accent-border px-3 py-1.5 font-mono text-sm text-accent-foreground">
                {truncateAddress(address)}
              </span>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </div>
          ) : (
            <Button onClick={connectAndSignIn} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
