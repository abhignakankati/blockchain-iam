import { ethers } from "hardhat";

/**
 * Deploys IdentityContract, then CredentialContract wired to it.
 * Run with: npx hardhat run scripts/deploy.ts --network <network>
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH\n");

  // 1. Deploy IdentityContract
  const IdentityContractFactory = await ethers.getContractFactory("IdentityContract");
  const identityContract = await IdentityContractFactory.deploy();
  await identityContract.waitForDeployment();
  const identityAddress = await identityContract.getAddress();
  console.log("✅ IdentityContract deployed to:", identityAddress);

  // 2. Deploy CredentialContract, pointing at IdentityContract
  const CredentialContractFactory = await ethers.getContractFactory("CredentialContract");
  const credentialContract = await CredentialContractFactory.deploy(identityAddress);
  await credentialContract.waitForDeployment();
  const credentialAddress = await credentialContract.getAddress();
  console.log("✅ CredentialContract deployed to:", credentialAddress);

  console.log("\nCopy these into apps/backend/.env:");
  console.log(`IDENTITY_CONTRACT_ADDRESS=${identityAddress}`);
  console.log(`CREDENTIAL_CONTRACT_ADDRESS=${credentialAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
