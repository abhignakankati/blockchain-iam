// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IIdentityContract {
    function isActive(address wallet) external view returns (bool);
    function hasRole(bytes32 role, address account) external view returns (bool);
}

contract CredentialContract is AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant CONTRACT_ADMIN_ROLE = keccak256("CONTRACT_ADMIN_ROLE");

    enum CredentialStatus {
        Active,
        Revoked
    }

    struct Credential {
        bytes32 credentialId;
        address subject;
        address issuer;
        bytes32 documentHash;
        string credentialType;
        string ipfsHash;
        uint256 issuedAt;
        uint256 expiresAt;
        CredentialStatus status;
    }

    IIdentityContract public identityContract;

    mapping(bytes32 => Credential) private credentials;
    mapping(address => bytes32[]) private credentialsBySubject;
    mapping(bytes32 => bool) private credentialExists;
    mapping(address => uint256) private issuerNonce;

    event CredentialIssued(
        bytes32 indexed credentialId,
        address indexed subject,
        address indexed issuer,
        bytes32 documentHash,
        uint256 expiresAt,
        uint256 timestamp
    );
    event CredentialRevoked(bytes32 indexed credentialId, address indexed revokedBy, uint256 timestamp);
    event IdentityContractUpdated(address indexed oldAddress, address indexed newAddress, address indexed updatedBy);

    constructor(address identityContractAddress) {
        require(identityContractAddress != address(0), "Credential: identity contract required");

        identityContract = IIdentityContract(identityContractAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(CONTRACT_ADMIN_ROLE, msg.sender);
    }

    function setIdentityContract(address newIdentityContract) external onlyRole(CONTRACT_ADMIN_ROLE) {
        require(newIdentityContract != address(0), "Credential: cannot set zero address");

        address oldAddress = address(identityContract);
        identityContract = IIdentityContract(newIdentityContract);

        emit IdentityContractUpdated(oldAddress, newIdentityContract, msg.sender);
    }

    function issueCredential(
        address subject,
        bytes32 documentHash,
        string calldata credentialType,
        string calldata ipfsHash,
        uint256 expiresAt
    ) external returns (bytes32 credentialId) {
        require(identityContract.isActive(msg.sender), "Credential: issuer must be an active identity");
        require(identityContract.hasRole(ISSUER_ROLE, msg.sender), "Credential: caller lacks ISSUER_ROLE");
        require(identityContract.isActive(subject), "Credential: subject must be an active identity");
        require(documentHash != bytes32(0), "Credential: document hash required");
        require(expiresAt == 0 || expiresAt > block.timestamp, "Credential: expiry must be in the future");

        uint256 nonce = issuerNonce[msg.sender]++;
        credentialId = keccak256(abi.encodePacked(subject, msg.sender, documentHash, nonce));

        require(!credentialExists[credentialId], "Credential: id collision, retry");

        credentials[credentialId] = Credential({
            credentialId: credentialId,
            subject: subject,
            issuer: msg.sender,
            documentHash: documentHash,
            credentialType: credentialType,
            ipfsHash: ipfsHash,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            status: CredentialStatus.Active
        });

        credentialExists[credentialId] = true;
        credentialsBySubject[subject].push(credentialId);

        emit CredentialIssued(credentialId, subject, msg.sender, documentHash, expiresAt, block.timestamp);
    }

    function revokeCredential(bytes32 credentialId) external {
        require(credentialExists[credentialId], "Credential: does not exist");

        Credential storage credential = credentials[credentialId];
        require(credential.status == CredentialStatus.Active, "Credential: already revoked");
        require(
            msg.sender == credential.issuer || hasRole(CONTRACT_ADMIN_ROLE, msg.sender),
            "Credential: not authorized to revoke"
        );

        credential.status = CredentialStatus.Revoked;

        emit CredentialRevoked(credentialId, msg.sender, block.timestamp);
    }

    function isValid(bytes32 credentialId) external view returns (bool) {
        if (!credentialExists[credentialId]) return false;

        Credential memory credential = credentials[credentialId];
        if (credential.status != CredentialStatus.Active) return false;
        if (credential.expiresAt != 0 && credential.expiresAt <= block.timestamp) return false;

        return true;
    }

    function verifyDocumentHash(bytes32 credentialId, bytes32 providedHash) external view returns (bool) {
        require(credentialExists[credentialId], "Credential: does not exist");
        return credentials[credentialId].documentHash == providedHash;
    }

    function getCredential(bytes32 credentialId) external view returns (Credential memory) {
        require(credentialExists[credentialId], "Credential: does not exist");
        return credentials[credentialId];
    }

    function getCredentialsBySubject(address subject) external view returns (bytes32[] memory) {
        return credentialsBySubject[subject];
    }
}
