import { ethers } from "hardhat";

/**
 * Deploys IdentityContract to whatever network is targeted
 * (e.g. `npx hardhat run scripts/deploy.ts --network localhost`).
 *
 * Prints the deployed address and the deployer's role assignments so you
 * can immediately copy the address into the backend's .env or MetaMask.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  const IdentityContractFactory = await ethers.getContractFactory("IdentityContract");
  const identityContract = await IdentityContractFactory.deploy();
  await identityContract.waitForDeployment();

  const address = await identityContract.getAddress();
  console.log("\n✅ IdentityContract deployed to:", address);

  const adminRole = await identityContract.ADMIN_ROLE();
  const isAdmin = await identityContract.hasRole(adminRole, deployer.address);
  console.log("Deployer has ADMIN_ROLE:", isAdmin);

  console.log("\nCopy this address into apps/backend/.env as IDENTITY_CONTRACT_ADDRESS");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
