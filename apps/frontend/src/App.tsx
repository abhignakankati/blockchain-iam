import type { ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { HomePage } from "@/pages/HomePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { PendingPage } from "@/pages/PendingPage";
import { AdminPage } from "@/pages/AdminPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { useAuth } from "@/context/AuthContext";
import { useIdentity, errMsg } from "@/hooks/useIdentity";

function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" }) {
  return (
    <p className={`mx-auto max-w-xl px-6 py-16 text-center text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      {children}
    </p>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
}

/** "/" sends each wallet to the right place based on its on-chain identity. */
function Landing() {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, error } = useIdentity();

  if (!isAuthenticated) return <HomePage />;
  if (isLoading) return <Notice>Checking your on-chain identity…</Notice>;
  if (error || !data) return <Notice tone="error">Couldn't read the blockchain: {errMsg(error)}. Is MetaMask on the Hardhat network?</Notice>;

  if (data.role === "admin") return <Navigate to="/admin" replace />;
  switch (data.status) {
    case "None": return <Navigate to="/register" replace />;
    case "Pending": return <Navigate to="/pending" replace />;
    case "Active": return <Navigate to="/dashboard" replace />;
    default: return <Notice tone="error">Your identity is {data.status.toLowerCase()}. Contact an administrator.</Notice>;
  }
}

function App() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<RequireAuth><RegisterPage /></RequireAuth>} />
          <Route path="/pending" element={<RequireAuth><PendingPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
