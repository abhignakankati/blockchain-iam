import { ethers } from "hardhat";

/**
 * Grants a role to an ACTIVE identity. Runs as Hardhat account #0 (the admin).
 * Usage: IDENTITY_ADDRESS=0x.. WALLET=0x.. ROLE=ISSUER_ROLE \
 *        npx hardhat run scripts/grantRole.ts --network localhost
 */
async function main() {
  const { IDENTITY_ADDRESS, WALLET, ROLE } = process.env;
  if (!IDENTITY_ADDRESS || !WALLET || !ROLE) {
    throw new Error("Set IDENTITY_ADDRESS, WALLET and ROLE (ADMIN_ROLE | ISSUER_ROLE | VERIFIER_ROLE)");
  }
  const identity = await ethers.getContractAt("IdentityContract", IDENTITY_ADDRESS);
  const tx = await identity.grantIdentityRole(WALLET, ethers.id(ROLE));
  await tx.wait();
  console.log(`Granted ${ROLE} to ${WALLET}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
