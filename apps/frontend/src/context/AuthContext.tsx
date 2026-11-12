import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { BrowserProvider, getAddress, type Eip1193Provider } from "ethers";
import { SiweMessage } from "siwe";
import { api } from "@/lib/api";
import { EXPECTED_CHAIN_ID } from "@/lib/contracts";

interface AuthState {
  address: string | null;
  isAuthenticated: boolean;
  isConnecting: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  connectAndSignIn: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/**
 * Wraps the full wallet-connect + SIWE login flow described in Module 5:
 * request a nonce, build and sign a SIWE message with the user's own
 * wallet, verify it against the backend, store the returned JWT. The JWT
 * is the only thing persisted (in localStorage) - the wallet connection
 * itself is re-established fresh on each page load via window.ethereum.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, check if a JWT already exists and derive the address from it
  // (JWTs here are unsigned-readable payloads client-side is fine to peek
  // at for display purposes - the backend independently re-verifies the
  // signature on every request, this is purely for UI state).
  useEffect(() => {
    const token = localStorage.getItem("iam_jwt");
    if (!token) return;

    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp && payload.exp * 1000 > Date.now()) {
        setAddress(payload.sub);
      } else {
        localStorage.removeItem("iam_jwt");
      }
    } catch {
      localStorage.removeItem("iam_jwt");
    }
  }, []);

  const connectAndSignIn = useCallback(async () => {
    setError(null);

    if (!window.ethereum) {
      setError("No wallet found. Please install MetaMask.");
      return;
    }

    setIsConnecting(true);

    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const walletAddress = getAddress(accounts[0]); // normalize to EIP-55 checksummed format

      const network = await provider.getNetwork();
      if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
        setError(`Wrong network. Please switch MetaMask to chain ID ${EXPECTED_CHAIN_ID}.`);
        setIsConnecting(false);
        return;
      }

      const signer = await provider.getSigner();

      const { data: nonceData } = await api.get("/api/auth/nonce", {
        params: { address: walletAddress },
      });

      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: walletAddress,
        statement: "Sign in to Blockchain IAM",
        uri: window.location.origin,
        version: "1",
        chainId: EXPECTED_CHAIN_ID,
        nonce: nonceData.nonce,
      });
      const messageToSign = siweMessage.prepareMessage();

      const signature = await signer.signMessage(messageToSign);

      const { data: verifyData } = await api.post("/api/auth/verify", {
        message: messageToSign,
        signature,
      });

      localStorage.setItem("iam_jwt", verifyData.token);
      setAddress(verifyData.address);
    } catch (err) {
      console.error("[auth] connectAndSignIn failed", err);
      const message = err instanceof Error ? err.message : "Failed to sign in";
      setError(message);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("iam_jwt");
    setAddress(null);
  }, []);

  const value: AuthContextValue = {
    address,
    isAuthenticated: !!address,
    isConnecting,
    error,
    connectAndSignIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
