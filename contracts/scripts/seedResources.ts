import { ethers } from "hardhat";

/**
 * Registers demo resources (admin = Hardhat account #0).
 * Usage: ACCESS_ADDRESS=0x.. APPROVER=0x.. npx hardhat run scripts/seedResources.ts --network localhost
 * APPROVER must be an ACTIVE identity (it signs approvals from its own wallet).
 */
async function main() {
  const { ACCESS_ADDRESS, APPROVER } = process.env;
  if (!ACCESS_ADDRESS || !APPROVER) throw new Error("Set ACCESS_ADDRESS and APPROVER");
  const [admin] = await ethers.getSigners();
  const access = await ethers.getContractAt("AccessControlContract", ACCESS_ADDRESS);
  const zero = ethers.ZeroHash;
  const none = ethers.ZeroAddress;

  const demo: [string, number, string][] = [
    ["Public Wiki", 0, none],   // Normal: auto-granted when policy passes
    ["HR Records", 1, APPROVER], // Sensitive: one approver signs off
  ];
  for (const [name, level, approver] of demo) {
    const tx = await access.registerResource(ethers.encodeBytes32String(name), admin.address, level, zero, zero, zero, approver, none);
    await tx.wait();
    console.log(`Registered "${name}"`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
