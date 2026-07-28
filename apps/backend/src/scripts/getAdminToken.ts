import { ethers } from "ethers";
import { SiweMessage } from "siwe";
import axios from "axios";

const BASE_URL = "http://localhost:4000";
const ADMIN_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Account #0

async function main() {
  const wallet = new ethers.Wallet(ADMIN_PRIVATE_KEY);

  const nonceRes = await axios.get(`${BASE_URL}/api/auth/nonce`, { params: { address: wallet.address } });
  const nonce = nonceRes.data.nonce;

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

  const verifyRes = await axios.post(`${BASE_URL}/api/auth/verify`, { message, signature });
  console.log("Admin token:", verifyRes.data.token);
}

main().catch((error) => {
  console.error(error.response?.data || error);
  process.exit(1);
});
