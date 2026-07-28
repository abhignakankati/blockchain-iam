import { ethers } from "ethers";
import { SiweMessage } from "siwe";
import axios from "axios";

/**
 * Simulates the full SIWE login flow a real frontend + MetaMask would
 * perform, using a known Hardhat test account instead of a browser wallet.
 * Not part of the production codebase — a one-time manual verification
 * script for this module. Uses Account #1, the same wallet registered and
 * approved as an active identity in our earlier live-listener test.
 */
const BASE_URL = "http://localhost:4000";
const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

async function main() {
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  console.log("Testing login for address:", wallet.address);

  // 1. Request a nonce
  const nonceRes = await axios.get(`${BASE_URL}/api/auth/nonce`, {
    params: { address: wallet.address },
  });
  const nonce = nonceRes.data.nonce;
  console.log("Received nonce:", nonce);

  // 2. Build and sign a SIWE message
  const siweMessage = new SiweMessage({
    domain: "localhost",
    address: wallet.address,
    statement: "Sign in to Blockchain IAM",
    uri: "http://localhost:4000",
    version: "1",
    chainId: 31337,
    nonce,
  });
  const message = siweMessage.prepareMessage();
  const signature = await wallet.signMessage(message);
  console.log("Message signed");

  // 3. Verify and get a JWT
  const verifyRes = await axios.post(`${BASE_URL}/api/auth/verify`, { message, signature });
  const { token, address } = verifyRes.data;
  console.log("Login successful. Address:", address);
  console.log("Token (first 20 chars):", token.slice(0, 20) + "...");

  // 4. Call the protected route with the JWT
  const meRes = await axios.get(`${BASE_URL}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("Protected route response:", meRes.data);
}

main().catch((error) => {
  if (axios.isAxiosError(error)) {
    console.error("Request failed:", error.response?.status, error.response?.data);
  } else {
    console.error(error);
  }
  process.exit(1);
});
