import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { IdentityContract } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("IdentityContract", function () {
  let identityContract: IdentityContract;
  let admin: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const sampleRefHash = ethers.keccak256(ethers.toUtf8Bytes("user1-mongo-id-salt"));

  beforeEach(async function () {
    [admin, user1, user2, stranger] = await ethers.getSigners();

    const IdentityContractFactory = await ethers.getContractFactory("IdentityContract");
    identityContract = await IdentityContractFactory.deploy();
    await identityContract.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should grant DEFAULT_ADMIN_ROLE and ADMIN_ROLE to the deployer", async function () {
      const adminRole = await identityContract.ADMIN_ROLE();
      const defaultAdminRole = await identityContract.DEFAULT_ADMIN_ROLE();

      expect(await identityContract.hasRole(adminRole, admin.address)).to.be.true;
      expect(await identityContract.hasRole(defaultAdminRole, admin.address)).to.be.true;
    });
  });

  describe("registerIdentity", function () {
    it("should register a new identity with Pending status", async function () {
      await identityContract.connect(user1).registerIdentity(sampleRefHash);

      const identity = await identityContract.getIdentity(user1.address);
      expect(identity.status).to.equal(1);
      expect(identity.wallet).to.equal(user1.address);
      expect(identity.offChainRefHash).to.equal(sampleRefHash);
    });

    it("should emit IdentityRegistered event", async function () {
      await expect(identityContract.connect(user1).registerIdentity(sampleRefHash))
        .to.emit(identityContract, "IdentityRegistered")
        .withArgs(user1.address, sampleRefHash, anyValue);
    });

    it("should reject registration with a zero hash", async function () {
      await expect(
        identityContract.connect(user1).registerIdentity(ethers.ZeroHash)
      ).to.be.revertedWith("Identity: reference hash required");
    });

    it("should reject duplicate registration from the same wallet", async function () {
      await identityContract.connect(user1).registerIdentity(sampleRefHash);

      await expect(
        identityContract.connect(user1).registerIdentity(sampleRefHash)
      ).to.be.revertedWith("Identity: already registered");
    });

    it("should NOT mark identity as active immediately after registration", async function () {
      await identityContract.connect(user1).registerIdentity(sampleRefHash);
      expect(await identityContract.isActive(user1.address)).to.be.false;
    });
  });

  describe("approveIdentity", function () {
    beforeEach(async function () {
      await identityContract.connect(user1).registerIdentity(sampleRefHash);
    });

    it("should allow an admin to approve a pending identity", async function () {
      await identityContract.connect(admin).approveIdentity(user1.address);

      const identity = await identityContract.getIdentity(user1.address);
      expect(identity.status).to.equal(2);
      expect(await identityContract.isActive(user1.address)).to.be.true;
    });

    it("should emit IdentityApproved and IdentityStatusChanged events", async function () {
      await expect(identityContract.connect(admin).approveIdentity(user1.address))
        .to.emit(identityContract, "IdentityApproved")
        .withArgs(user1.address, admin.address, anyValue);
    });

    it("should reject approval attempts from a non-admin account", async function () {
      await expect(
        identityContract.connect(stranger).approveIdentity(user1.address)
      ).to.be.revertedWithCustomError(identityContract, "AccessControlUnauthorizedAccount");
    });

    it("should reject approving an identity that never registered", async function () {
      await expect(
        identityContract.connect(admin).approveIdentity(user2.address)
      ).to.be.revertedWith("Identity: not pending approval");
    });

    it("should reject double-approval of an already-active identity", async function () {
      await identityContract.connect(admin).approveIdentity(user1.address);

      await expect(
        identityContract.connect(admin).approveIdentity(user1.address)
      ).to.be.revertedWith("Identity: not pending approval");
    });
  });

  describe("suspendIdentity and reactivateIdentity", function () {
    beforeEach(async function () {
      await identityContract.connect(user1).registerIdentity(sampleRefHash);
      await identityContract.connect(admin).approveIdentity(user1.address);
    });

    it("should allow an admin to suspend an active identity", async function () {
      await identityContract.connect(admin).suspendIdentity(user1.address);

      expect(await identityContract.isActive(user1.address)).to.be.false;
      const identity = await identityContract.getIdentity(user1.address);
      expect(identity.status).to.equal(3);
    });

    it("should reject suspending a non-active identity", async function () {
      await identityContract.connect(admin).suspendIdentity(user1.address);

      await expect(
        identityContract.connect(admin).suspendIdentity(user1.address)
      ).to.be.revertedWith("Identity: must be active to suspend");
    });

    it("should allow an admin to reactivate a suspended identity", async function () {
      await identityContract.connect(admin).suspendIdentity(user1.address);
      await identityContract.connect(admin).reactivateIdentity(user1.address);

      expect(await identityContract.isActive(user1.address)).to.be.true;
    });

    it("should reject reactivating an identity that isn't suspended", async function () {
      await expect(
        identityContract.connect(admin).reactivateIdentity(user1.address)
      ).to.be.revertedWith("Identity: must be suspended to reactivate");
    });
  });

  describe("revokeIdentity", function () {
    beforeEach(async function () {
      await identityContract.connect(user1).registerIdentity(sampleRefHash);
      await identityContract.connect(admin).approveIdentity(user1.address);
    });

    it("should allow an admin to revoke an active identity", async function () {
      await identityContract.connect(admin).revokeIdentity(user1.address);

      const identity = await identityContract.getIdentity(user1.address);
      expect(identity.status).to.equal(4);
      expect(await identityContract.isActive(user1.address)).to.be.false;
    });

    it("should allow revoking a suspended identity too", async function () {
      await identityContract.connect(admin).suspendIdentity(user1.address);
      await identityContract.connect(admin).revokeIdentity(user1.address);

      const identity = await identityContract.getIdentity(user1.address);
      expect(identity.status).to.equal(4);
    });

    it("should reject revoking an already-revoked identity", async function () {
      await identityContract.connect(admin).revokeIdentity(user1.address);

      await expect(
        identityContract.connect(admin).revokeIdentity(user1.address)
      ).to.be.revertedWith("Identity: cannot revoke from current status");
    });

    it("should reject non-admin revocation attempts", async function () {
      await expect(
        identityContract.connect(stranger).revokeIdentity(user1.address)
      ).to.be.revertedWithCustomError(identityContract, "AccessControlUnauthorizedAccount");
    });
  });

  describe("grantIdentityRole", function () {
    beforeEach(async function () {
      await identityContract.connect(user1).registerIdentity(sampleRefHash);
      await identityContract.connect(admin).approveIdentity(user1.address);
    });

    it("should allow an admin to grant ISSUER_ROLE to an active identity", async function () {
      const issuerRole = await identityContract.ISSUER_ROLE();
      await identityContract.connect(admin).grantIdentityRole(user1.address, issuerRole);

      expect(await identityContract.hasRole(issuerRole, user1.address)).to.be.true;
    });

    it("should reject granting a role to a non-active identity", async function () {
      const issuerRole = await identityContract.ISSUER_ROLE();

      await expect(
        identityContract.connect(admin).grantIdentityRole(user2.address, issuerRole)
      ).to.be.revertedWith("Identity: must be active to receive a role");
    });

    it("should reject an unrecognized role hash", async function () {
      const fakeRole = ethers.keccak256(ethers.toUtf8Bytes("FAKE_ROLE"));

      await expect(
        identityContract.connect(admin).grantIdentityRole(user1.address, fakeRole)
      ).to.be.revertedWith("Identity: unrecognized role");
    });
  });
});
