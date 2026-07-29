import { ethers } from "ethers";
import { SiweMessage } from "siwe";
import axios from "axios";

const BASE_URL = "http://localhost:4000";
const ISSUER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // Account #1

async function main() {
  const wallet = new ethers.Wallet(ISSUER_PRIVATE_KEY);

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
  console.log("Issuer token:", verifyRes.data.token);
}

main().catch((error) => {
  console.error(error.response?.data || error);
  process.exit(1);
});
