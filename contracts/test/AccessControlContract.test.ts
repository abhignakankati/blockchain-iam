import { expect } from "chai";
import { ethers } from "hardhat";
import { AccessControlContract, IdentityContract } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("AccessControlContract", function () {
  let identityContract: IdentityContract;
  let acContract: AccessControlContract;
  let admin: HardhatEthersSigner;
  let approver1: HardhatEthersSigner;
  let approver2: HardhatEthersSigner;
  let resourceOwner: HardhatEthersSigner;
  let requester: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const departmentKey = ethers.keccak256(ethers.toUtf8Bytes("department"));
  const engineeringValue = ethers.keccak256(ethers.toUtf8Bytes("Engineering"));
  const salesValue = ethers.keccak256(ethers.toUtf8Bytes("Sales"));

  const normalResourceId = ethers.keccak256(ethers.toUtf8Bytes("resource-normal"));
  const sensitiveResourceId = ethers.keccak256(ethers.toUtf8Bytes("resource-sensitive"));
  const criticalResourceId = ethers.keccak256(ethers.toUtf8Bytes("resource-critical"));

  const SensitivityLevel = { Normal: 0, Sensitive: 1, Critical: 2 };
  const RequestStatus = { None: 0, Pending: 1, Granted: 2, Denied: 3 };

  async function setupActiveIdentity(signer: HardhatEthersSigner, refSeed: string) {
    const refHash = ethers.keccak256(ethers.toUtf8Bytes(refSeed));
    await identityContract.connect(signer).registerIdentity(refHash);
    await identityContract.connect(admin).approveIdentity(signer.address);
  }

  beforeEach(async function () {
    [admin, approver1, approver2, resourceOwner, requester, stranger] = await ethers.getSigners();

    const IdentityContractFactory = await ethers.getContractFactory("IdentityContract");
    identityContract = await IdentityContractFactory.deploy();
    await identityContract.waitForDeployment();

    const AccessControlContractFactory = await ethers.getContractFactory("AccessControlContract");
    acContract = await AccessControlContractFactory.deploy(await identityContract.getAddress());
    await acContract.waitForDeployment();

    await setupActiveIdentity(requester, "requester-ref");
    await setupActiveIdentity(stranger, "stranger-ref");
  });

  describe("Deployment", function () {
    it("should reject deployment with a zero-address IdentityContract", async function () {
      const Factory = await ethers.getContractFactory("AccessControlContract");
      await expect(Factory.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "AccessControl: identity contract required"
      );
    });

    it("should grant CONTRACT_ADMIN_ROLE to the deployer", async function () {
      const role = await acContract.CONTRACT_ADMIN_ROLE();
      expect(await acContract.hasRole(role, admin.address)).to.be.true;
    });
  });

  describe("setAttribute", function () {
    it("should allow admin to set an attribute for an active identity", async function () {
      await acContract.connect(admin).setAttribute(requester.address, departmentKey, engineeringValue);
      expect(await acContract.getAttribute(requester.address, departmentKey)).to.equal(engineeringValue);
    });

    it("should reject setting an attribute for a non-active identity", async function () {
      await expect(
        acContract.connect(admin).setAttribute(ethers.Wallet.createRandom().address, departmentKey, engineeringValue)
      ).to.be.revertedWith("AccessControl: identity must be active");
    });

    it("should reject non-admin callers", async function () {
      await expect(
        acContract.connect(stranger).setAttribute(requester.address, departmentKey, engineeringValue)
      ).to.be.revertedWithCustomError(acContract, "AccessControlUnauthorizedAccount");
    });
  });

  describe("registerResource - validation per sensitivity tier", function () {
    it("should register a Normal resource with no approvers", async function () {
      await acContract
        .connect(admin)
        .registerResource(
          normalResourceId,
          resourceOwner.address,
          SensitivityLevel.Normal,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );

      const resource = await acContract.getResource(normalResourceId);
      expect(resource.sensitivityLevel).to.equal(SensitivityLevel.Normal);
    });

    it("should reject a Normal resource with an approver set", async function () {
      await expect(
        acContract
          .connect(admin)
          .registerResource(
            normalResourceId,
            resourceOwner.address,
            SensitivityLevel.Normal,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.ZeroHash,
            approver1.address,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("AccessControl: Normal resources cannot have approvers");
    });

    it("should register a Sensitive resource with exactly one approver", async function () {
      await acContract
        .connect(admin)
        .registerResource(
          sensitiveResourceId,
          resourceOwner.address,
          SensitivityLevel.Sensitive,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          approver1.address,
          ethers.ZeroAddress
        );

      const resource = await acContract.getResource(sensitiveResourceId);
      expect(resource.approver1).to.equal(approver1.address);
    });

    it("should reject a Sensitive resource with no approver", async function () {
      await expect(
        acContract
          .connect(admin)
          .registerResource(
            sensitiveResourceId,
            resourceOwner.address,
            SensitivityLevel.Sensitive,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("AccessControl: Sensitive resources require one approver");
    });

    it("should reject a Sensitive resource with two approvers", async function () {
      await expect(
        acContract
          .connect(admin)
          .registerResource(
            sensitiveResourceId,
            resourceOwner.address,
            SensitivityLevel.Sensitive,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.ZeroHash,
            approver1.address,
            approver2.address
          )
      ).to.be.revertedWith("AccessControl: Sensitive resources must not set a second approver");
    });

    it("should register a Critical resource with two distinct approvers", async function () {
      await acContract
        .connect(admin)
        .registerResource(
          criticalResourceId,
          resourceOwner.address,
          SensitivityLevel.Critical,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          approver1.address,
          approver2.address
        );

      const resource = await acContract.getResource(criticalResourceId);
      expect(resource.approver1).to.equal(approver1.address);
      expect(resource.approver2).to.equal(approver2.address);
    });

    it("should reject a Critical resource with only one approver", async function () {
      await expect(
        acContract
          .connect(admin)
          .registerResource(
            criticalResourceId,
            resourceOwner.address,
            SensitivityLevel.Critical,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.ZeroHash,
            approver1.address,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("AccessControl: Critical resources require two approvers");
    });

    it("should reject a Critical resource with identical approvers", async function () {
      await expect(
        acContract
          .connect(admin)
          .registerResource(
            criticalResourceId,
            resourceOwner.address,
            SensitivityLevel.Critical,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.ZeroHash,
            approver1.address,
            approver1.address
          )
      ).to.be.revertedWith("AccessControl: Critical approvers must be distinct");
    });

    it("should reject registering a duplicate resourceId", async function () {
      await acContract
        .connect(admin)
        .registerResource(
          normalResourceId,
          resourceOwner.address,
          SensitivityLevel.Normal,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );

      await expect(
        acContract
          .connect(admin)
          .registerResource(
            normalResourceId,
            resourceOwner.address,
            SensitivityLevel.Normal,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.ZeroHash,
            ethers.ZeroAddress,
            ethers.ZeroAddress
          )
      ).to.be.revertedWith("AccessControl: resource already registered");
    });
  });

  describe("requestAccess - Normal resource (automatic decision)", function () {
    beforeEach(async function () {
      await acContract
        .connect(admin)
        .registerResource(
          normalResourceId,
          resourceOwner.address,
          SensitivityLevel.Normal,
          ethers.ZeroHash,
          departmentKey,
          engineeringValue,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );
    });

    it("should grant access immediately when policy passes", async function () {
      await acContract.connect(admin).setAttribute(requester.address, departmentKey, engineeringValue);

      await acContract.connect(requester).requestAccess(normalResourceId);

      expect(await acContract.hasAccess(requester.address, normalResourceId)).to.be.true;
    });

    it("should deny access immediately when attribute does not match", async function () {
      await acContract.connect(admin).setAttribute(requester.address, departmentKey, salesValue);

      await acContract.connect(requester).requestAccess(normalResourceId);

      expect(await acContract.hasAccess(requester.address, normalResourceId)).to.be.false;
      const request = await acContract.getAccessRequest(normalResourceId, requester.address);
      expect(request.status).to.equal(RequestStatus.Denied);
    });

    it("should deny access when requester has no attribute set at all", async function () {
      await acContract.connect(requester).requestAccess(normalResourceId);

      expect(await acContract.hasAccess(requester.address, normalResourceId)).to.be.false;
    });

    it("should reject requests for a non-existent resource", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake-resource"));
      await expect(acContract.connect(requester).requestAccess(fakeId)).to.be.revertedWith(
        "AccessControl: resource does not exist"
      );
    });
  });

  describe("requestAccess + approveAccess - Sensitive resource (single approver)", function () {
    beforeEach(async function () {
      await setupActiveIdentity(approver1, "approver1-ref");

      await acContract
        .connect(admin)
        .registerResource(
          sensitiveResourceId,
          resourceOwner.address,
          SensitivityLevel.Sensitive,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          approver1.address,
          ethers.ZeroAddress
        );
    });

    it("should move to Pending after a successful policy check", async function () {
      await acContract.connect(requester).requestAccess(sensitiveResourceId);

      const request = await acContract.getAccessRequest(sensitiveResourceId, requester.address);
      expect(request.status).to.equal(RequestStatus.Pending);
      expect(await acContract.hasAccess(requester.address, sensitiveResourceId)).to.be.false;
    });

    it("should grant access once the single designated approver approves", async function () {
      await acContract.connect(requester).requestAccess(sensitiveResourceId);
      await acContract.connect(approver1).approveAccess(sensitiveResourceId, requester.address);

      expect(await acContract.hasAccess(requester.address, sensitiveResourceId)).to.be.true;
    });

    it("should reject approval from someone who is not the designated approver", async function () {
      await acContract.connect(requester).requestAccess(sensitiveResourceId);

      await expect(
        acContract.connect(stranger).approveAccess(sensitiveResourceId, requester.address)
      ).to.be.revertedWith("AccessControl: caller is not a designated approver");
    });

    it("should reject approval when there is no pending request", async function () {
      await expect(
        acContract.connect(approver1).approveAccess(sensitiveResourceId, requester.address)
      ).to.be.revertedWith("AccessControl: no pending request for this requester");
    });
  });

  describe("requestAccess + approveAccess - Critical resource (dual approver)", function () {
    beforeEach(async function () {
      await setupActiveIdentity(approver1, "approver1-ref");
      await setupActiveIdentity(approver2, "approver2-ref");

      await acContract
        .connect(admin)
        .registerResource(
          criticalResourceId,
          resourceOwner.address,
          SensitivityLevel.Critical,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          approver1.address,
          approver2.address
        );
    });

    it("should NOT grant access after only one of two approvers signs off", async function () {
      await acContract.connect(requester).requestAccess(criticalResourceId);
      await acContract.connect(approver1).approveAccess(criticalResourceId, requester.address);

      expect(await acContract.hasAccess(requester.address, criticalResourceId)).to.be.false;
      const request = await acContract.getAccessRequest(criticalResourceId, requester.address);
      expect(request.status).to.equal(RequestStatus.Pending);
    });

    it("should grant access once both approvers sign off", async function () {
      await acContract.connect(requester).requestAccess(criticalResourceId);
      await acContract.connect(approver1).approveAccess(criticalResourceId, requester.address);
      await acContract.connect(approver2).approveAccess(criticalResourceId, requester.address);

      expect(await acContract.hasAccess(requester.address, criticalResourceId)).to.be.true;
      const request = await acContract.getAccessRequest(criticalResourceId, requester.address);
      expect(request.status).to.equal(RequestStatus.Granted);
    });

    it("should grant access regardless of which approver signs first", async function () {
      await acContract.connect(requester).requestAccess(criticalResourceId);
      await acContract.connect(approver2).approveAccess(criticalResourceId, requester.address);
      await acContract.connect(approver1).approveAccess(criticalResourceId, requester.address);

      expect(await acContract.hasAccess(requester.address, criticalResourceId)).to.be.true;
    });
  });

  describe("denyAccess", function () {
    beforeEach(async function () {
      await setupActiveIdentity(approver1, "approver1-ref");

      await acContract
        .connect(admin)
        .registerResource(
          sensitiveResourceId,
          resourceOwner.address,
          SensitivityLevel.Sensitive,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          approver1.address,
          ethers.ZeroAddress
        );

      await acContract.connect(requester).requestAccess(sensitiveResourceId);
    });

    it("should allow the designated approver to explicitly deny a pending request", async function () {
      await acContract.connect(approver1).denyAccess(sensitiveResourceId, requester.address);

      const request = await acContract.getAccessRequest(sensitiveResourceId, requester.address);
      expect(request.status).to.equal(RequestStatus.Denied);
      expect(await acContract.hasAccess(requester.address, sensitiveResourceId)).to.be.false;
    });

    it("should allow CONTRACT_ADMIN_ROLE to deny even if not a designated approver", async function () {
      await acContract.connect(admin).denyAccess(sensitiveResourceId, requester.address);

      const request = await acContract.getAccessRequest(sensitiveResourceId, requester.address);
      expect(request.status).to.equal(RequestStatus.Denied);
    });

    it("should reject denial from an unrelated account", async function () {
      await expect(
        acContract.connect(stranger).denyAccess(sensitiveResourceId, requester.address)
      ).to.be.revertedWith("AccessControl: not authorized to deny this request");
    });
  });

  describe("revokeAccess", function () {
    beforeEach(async function () {
      await acContract
        .connect(admin)
        .registerResource(
          normalResourceId,
          resourceOwner.address,
          SensitivityLevel.Normal,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroAddress,
          ethers.ZeroAddress
        );

      await acContract.connect(requester).requestAccess(normalResourceId);
    });

    it("should allow the resource owner to revoke previously granted access", async function () {
      expect(await acContract.hasAccess(requester.address, normalResourceId)).to.be.true;

      await acContract.connect(resourceOwner).revokeAccess(normalResourceId, requester.address);

      expect(await acContract.hasAccess(requester.address, normalResourceId)).to.be.false;
    });

    it("should allow CONTRACT_ADMIN_ROLE to revoke", async function () {
      await acContract.connect(admin).revokeAccess(normalResourceId, requester.address);
      expect(await acContract.hasAccess(requester.address, normalResourceId)).to.be.false;
    });

    it("should reject revocation from an unrelated account", async function () {
      await expect(
        acContract.connect(stranger).revokeAccess(normalResourceId, requester.address)
      ).to.be.revertedWith("AccessControl: not authorized to revoke access");
    });

    it("should reject revoking access that isn't currently granted", async function () {
      await acContract.connect(resourceOwner).revokeAccess(normalResourceId, requester.address);

      await expect(
        acContract.connect(resourceOwner).revokeAccess(normalResourceId, requester.address)
      ).to.be.revertedWith("AccessControl: access is not currently granted");
    });
  });

  describe("updateApprovers", function () {
    beforeEach(async function () {
      await setupActiveIdentity(approver1, "approver1-ref");
      await setupActiveIdentity(approver2, "approver2-ref");

      await acContract
        .connect(admin)
        .registerResource(
          sensitiveResourceId,
          resourceOwner.address,
          SensitivityLevel.Sensitive,
          ethers.ZeroHash,
          ethers.ZeroHash,
          ethers.ZeroHash,
          approver1.address,
          ethers.ZeroAddress
        );
    });

 it("should allow the resource owner to change the designated approver", async function () {
      // stranger is already an active identity (set up in the outer beforeEach),
      // so it can be used directly as the new approver without re-registering.
      await acContract.connect(resourceOwner).updateApprovers(sensitiveResourceId, stranger.address, ethers.ZeroAddress);

      const resource = await acContract.getResource(sensitiveResourceId);
      expect(resource.approver1).to.equal(stranger.address);
    });

    it("should reject updates from an unrelated account", async function () {
      await expect(
        acContract.connect(stranger).updateApprovers(sensitiveResourceId, approver2.address, ethers.ZeroAddress)
      ).to.be.revertedWith("AccessControl: not authorized to update approvers");
    });

    it("should still enforce the sensitivity tier's approver rules on update", async function () {
      await expect(
        acContract.connect(resourceOwner).updateApprovers(sensitiveResourceId, approver1.address, approver2.address)
      ).to.be.revertedWith("AccessControl: Sensitive resources must not set a second approver");
    });
  });
});
