import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { CredentialContract, IdentityContract } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CredentialContract", function () {
  let identityContract: IdentityContract;
  let credentialContract: CredentialContract;
  let admin: HardhatEthersSigner;
  let issuer: HardhatEthersSigner;
  let subject: HardhatEthersSigner;
  let otherSubject: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const docHash = ethers.keccak256(ethers.toUtf8Bytes("sample-document-content"));
  const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes("tampered-document-content"));

  async function setupActiveIdentity(signer: HardhatEthersSigner, refSeed: string) {
    const refHash = ethers.keccak256(ethers.toUtf8Bytes(refSeed));
    await identityContract.connect(signer).registerIdentity(refHash);
    await identityContract.connect(admin).approveIdentity(signer.address);
  }

  beforeEach(async function () {
    [admin, issuer, subject, otherSubject, stranger] = await ethers.getSigners();

    const IdentityContractFactory = await ethers.getContractFactory("IdentityContract");
    identityContract = await IdentityContractFactory.deploy();
    await identityContract.waitForDeployment();

    const CredentialContractFactory = await ethers.getContractFactory("CredentialContract");
    credentialContract = await CredentialContractFactory.deploy(await identityContract.getAddress());
    await credentialContract.waitForDeployment();

    await setupActiveIdentity(issuer, "issuer-ref");
    const issuerRole = await identityContract.ISSUER_ROLE();
    await identityContract.connect(admin).grantIdentityRole(issuer.address, issuerRole);

    await setupActiveIdentity(subject, "subject-ref");
  });

  describe("Deployment", function () {
    it("should reject deployment with a zero-address IdentityContract", async function () {
      const CredentialContractFactory = await ethers.getContractFactory("CredentialContract");
      await expect(CredentialContractFactory.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "Credential: identity contract required"
      );
    });

    it("should link to the correct IdentityContract address", async function () {
      expect(await credentialContract.identityContract()).to.equal(await identityContract.getAddress());
    });

    it("should grant CONTRACT_ADMIN_ROLE to the deployer", async function () {
      const contractAdminRole = await credentialContract.CONTRACT_ADMIN_ROLE();
      expect(await credentialContract.hasRole(contractAdminRole, admin.address)).to.be.true;
    });
  });

  describe("issueCredential", function () {
    it("should issue a credential when caller is an active issuer and subject is active", async function () {
      await credentialContract
        .connect(issuer)
        .issueCredential(subject.address, docHash, "degree", "QmSampleIpfsCid", 0);

      const credentialIds = await credentialContract.getCredentialsBySubject(subject.address);
      expect(credentialIds.length).to.equal(1);

      const credential = await credentialContract.getCredential(credentialIds[0]);
      expect(credential.subject).to.equal(subject.address);
      expect(credential.issuer).to.equal(issuer.address);
      expect(credential.documentHash).to.equal(docHash);
      expect(credential.status).to.equal(0);
    });

    it("should emit CredentialIssued event", async function () {
      await expect(
        credentialContract.connect(issuer).issueCredential(subject.address, docHash, "degree", "QmCid", 0)
      )
        .to.emit(credentialContract, "CredentialIssued")
        .withArgs(anyValue, subject.address, issuer.address, docHash, 0, anyValue);
    });

    it("should reject issuance from a caller without ISSUER_ROLE", async function () {
      await setupActiveIdentity(stranger, "stranger-ref");

      await expect(
        credentialContract.connect(stranger).issueCredential(subject.address, docHash, "degree", "QmCid", 0)
      ).to.be.revertedWith("Credential: caller lacks ISSUER_ROLE");
    });

    it("should reject issuance from an issuer whose identity is not active", async function () {
      await identityContract.connect(admin).suspendIdentity(issuer.address);

      await expect(
        credentialContract.connect(issuer).issueCredential(subject.address, docHash, "degree", "QmCid", 0)
      ).to.be.revertedWith("Credential: issuer must be an active identity");
    });

    it("should reject issuance to a subject who is not an active identity", async function () {
      await expect(
        credentialContract.connect(issuer).issueCredential(stranger.address, docHash, "degree", "QmCid", 0)
      ).to.be.revertedWith("Credential: subject must be an active identity");
    });

    it("should reject a zero document hash", async function () {
      await expect(
        credentialContract.connect(issuer).issueCredential(subject.address, ethers.ZeroHash, "degree", "QmCid", 0)
      ).to.be.revertedWith("Credential: document hash required");
    });

    it("should reject an expiry timestamp in the past", async function () {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600;

      await expect(
        credentialContract
          .connect(issuer)
          .issueCredential(subject.address, docHash, "degree", "QmCid", pastTimestamp)
      ).to.be.revertedWith("Credential: expiry must be in the future");
    });

    it("should allow the same issuer to issue multiple distinct credentials to the same subject", async function () {
      await credentialContract.connect(issuer).issueCredential(subject.address, docHash, "degree", "QmCid1", 0);
      await credentialContract
        .connect(issuer)
        .issueCredential(subject.address, tamperedHash, "transcript", "QmCid2", 0);

      const credentialIds = await credentialContract.getCredentialsBySubject(subject.address);
      expect(credentialIds.length).to.equal(2);
      expect(credentialIds[0]).to.not.equal(credentialIds[1]);
    });
  });

  describe("isValid", function () {
    it("should return true for a freshly issued, non-expiring credential", async function () {
      await credentialContract.connect(issuer).issueCredential(subject.address, docHash, "degree", "QmCid", 0);
      const [credentialId] = await credentialContract.getCredentialsBySubject(subject.address);

      expect(await credentialContract.isValid(credentialId)).to.be.true;
    });

    it("should return false for a non-existent credentialId", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      expect(await credentialContract.isValid(fakeId)).to.be.false;
    });

    // it("should return false for an expired credential", async function () {
    //   const futureTimestamp = Math.floor(Date.now() / 1000) + 10;
    //   await credentialContract
    //     .connect(issuer)
    //     .issueCredential(subject.address, docHash, "degree", "QmCid", futureTimestamp);
    //   const [credentialId] = await credentialContract.getCredentialsBySubject(subject.address);

    //   await ethers.provider.send("evm_increaseTime", [20]);
    //   await ethers.provider.send("evm_mine", []);

    //   expect(await credentialContract.isValid(credentialId)).to.be.false;
    // });
    it("should return false for an expired credential", async function () {
      const latestBlock = await ethers.provider.getBlock("latest");
      const futureTimestamp = latestBlock!.timestamp + 100;
      await credentialContract
        .connect(issuer)
        .issueCredential(subject.address, docHash, "degree", "QmCid", futureTimestamp);
      const [credentialId] = await credentialContract.getCredentialsBySubject(subject.address);

      // Fast-forward past expiry
      await ethers.provider.send("evm_increaseTime", [200]);
      await ethers.provider.send("evm_mine", []);

      expect(await credentialContract.isValid(credentialId)).to.be.false;
    });

    it("should return false for a revoked credential", async function () {
      await credentialContract.connect(issuer).issueCredential(subject.address, docHash, "degree", "QmCid", 0);
      const [credentialId] = await credentialContract.getCredentialsBySubject(subject.address);

      await credentialContract.connect(issuer).revokeCredential(credentialId);

      expect(await credentialContract.isValid(credentialId)).to.be.false;
    });
  });

  describe("revokeCredential", function () {
    let credentialId: string;

    beforeEach(async function () {
      await credentialContract.connect(issuer).issueCredential(subject.address, docHash, "degree", "QmCid", 0);
      [credentialId] = await credentialContract.getCredentialsBySubject(subject.address);
    });

    it("should allow the original issuer to revoke", async function () {
      await credentialContract.connect(issuer).revokeCredential(credentialId);

      const credential = await credentialContract.getCredential(credentialId);
      expect(credential.status).to.equal(1);
    });

    it("should allow CONTRACT_ADMIN_ROLE to revoke, even if not the issuer", async function () {
      await credentialContract.connect(admin).revokeCredential(credentialId);

      const credential = await credentialContract.getCredential(credentialId);
      expect(credential.status).to.equal(1);
    });

    it("should emit CredentialRevoked event", async function () {
      await expect(credentialContract.connect(issuer).revokeCredential(credentialId))
        .to.emit(credentialContract, "CredentialRevoked")
        .withArgs(credentialId, issuer.address, anyValue);
    });

    it("should reject revocation from an unrelated account", async function () {
      await expect(credentialContract.connect(stranger).revokeCredential(credentialId)).to.be.revertedWith(
        "Credential: not authorized to revoke"
      );
    });

    it("should reject revoking an already-revoked credential", async function () {
      await credentialContract.connect(issuer).revokeCredential(credentialId);

      await expect(credentialContract.connect(issuer).revokeCredential(credentialId)).to.be.revertedWith(
        "Credential: already revoked"
      );
    });

    it("should reject revoking a non-existent credentialId", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));

      await expect(credentialContract.connect(issuer).revokeCredential(fakeId)).to.be.revertedWith(
        "Credential: does not exist"
      );
    });
  });

  describe("verifyDocumentHash", function () {
    let credentialId: string;

    beforeEach(async function () {
      await credentialContract.connect(issuer).issueCredential(subject.address, docHash, "degree", "QmCid", 0);
      [credentialId] = await credentialContract.getCredentialsBySubject(subject.address);
    });

    it("should return true when the provided hash matches", async function () {
      expect(await credentialContract.verifyDocumentHash(credentialId, docHash)).to.be.true;
    });

    it("should return false when the provided hash does not match (tamper detection)", async function () {
      expect(await credentialContract.verifyDocumentHash(credentialId, tamperedHash)).to.be.false;
    });

    it("should revert for a non-existent credentialId", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));

      await expect(credentialContract.verifyDocumentHash(fakeId, docHash)).to.be.revertedWith(
        "Credential: does not exist"
      );
    });
  });

  describe("setIdentityContract", function () {
    it("should allow CONTRACT_ADMIN_ROLE to update the IdentityContract address", async function () {
      const IdentityContractFactory = await ethers.getContractFactory("IdentityContract");
      const newIdentityContract = await IdentityContractFactory.deploy();
      await newIdentityContract.waitForDeployment();
      const newAddress = await newIdentityContract.getAddress();

      await credentialContract.connect(admin).setIdentityContract(newAddress);

      expect(await credentialContract.identityContract()).to.equal(newAddress);
    });

    it("should emit IdentityContractUpdated event", async function () {
      const IdentityContractFactory = await ethers.getContractFactory("IdentityContract");
      const newIdentityContract = await IdentityContractFactory.deploy();
      await newIdentityContract.waitForDeployment();
      const newAddress = await newIdentityContract.getAddress();
      const oldAddress = await identityContract.getAddress();

      await expect(credentialContract.connect(admin).setIdentityContract(newAddress))
        .to.emit(credentialContract, "IdentityContractUpdated")
        .withArgs(oldAddress, newAddress, admin.address);
    });

    it("should reject setting the zero address", async function () {
      await expect(
        credentialContract.connect(admin).setIdentityContract(ethers.ZeroAddress)
      ).to.be.revertedWith("Credential: cannot set zero address");
    });

    it("should reject updates from a non-admin account", async function () {
      const IdentityContractFactory = await ethers.getContractFactory("IdentityContract");
      const newIdentityContract = await IdentityContractFactory.deploy();
      await newIdentityContract.waitForDeployment();

      await expect(
        credentialContract.connect(stranger).setIdentityContract(await newIdentityContract.getAddress())
      ).to.be.revertedWithCustomError(credentialContract, "AccessControlUnauthorizedAccount");
    });
  });
});
