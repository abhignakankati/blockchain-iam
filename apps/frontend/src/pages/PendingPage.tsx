import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useIdentity } from "@/hooks/useIdentity";

export function PendingPage() {
  const navigate = useNavigate();
  const { data: identity } = useIdentity();
  const { data: profile } = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get("/api/users/me")).data,
    refetchInterval: 5000,
    retry: false,
  });

  // Once the admin approves (status leaves Pending), hand control back to the router.
  useEffect(() => {
    if (identity && identity.status !== "Pending") navigate("/");
  }, [identity, navigate]);

  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
      <h1 className="mt-6 text-2xl font-semibold">Waiting for admin approval</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your registration is on-chain. This page updates automatically once an administrator approves you.
      </p>
      {profile && (
        <div className="mt-8 rounded-lg border border-border bg-card p-4 text-left text-sm">
          <p><span className="text-muted-foreground">Name:</span> {profile.name}</p>
          <p><span className="text-muted-foreground">Email:</span> {profile.email}</p>
          {profile.department && <p><span className="text-muted-foreground">Department:</span> {profile.department}</p>}
        </div>
      )}
    </div>
  );
}
