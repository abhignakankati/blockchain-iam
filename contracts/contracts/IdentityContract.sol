// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title IdentityContract
/// @notice Manages decentralized identity registration, admin approval,
///         and lifecycle status for users of the Blockchain IAM system.
/// @dev Stores no personally identifiable information on-chain. Only a
///      wallet-linked identity reference, role, and status are recorded.
///      Full profile data remains in off-chain storage (MongoDB/IPFS).
contract IdentityContract is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    enum IdentityStatus {
        None,
        Pending,
        Active,
        Suspended,
        Revoked
    }

    struct Identity {
        address wallet;
        bytes32 offChainRefHash;
        IdentityStatus status;
        uint256 registeredAt;
        uint256 updatedAt;
    }

    mapping(address => Identity) private identities;

    event IdentityRegistered(address indexed wallet, bytes32 offChainRefHash, uint256 timestamp);
    event IdentityApproved(address indexed wallet, address indexed approvedBy, uint256 timestamp);
    event IdentityStatusChanged(
        address indexed wallet,
        IdentityStatus previousStatus,
        IdentityStatus newStatus,
        address indexed changedBy,
        uint256 timestamp
    );
    event IdentityRoleGranted(address indexed wallet, bytes32 indexed role, address indexed grantedBy);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function registerIdentity(bytes32 offChainRefHash) external {
        require(identities[msg.sender].status == IdentityStatus.None, "Identity: already registered");
        require(offChainRefHash != bytes32(0), "Identity: reference hash required");

        identities[msg.sender] = Identity({
            wallet: msg.sender,
            offChainRefHash: offChainRefHash,
            status: IdentityStatus.Pending,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp
        });

        emit IdentityRegistered(msg.sender, offChainRefHash, block.timestamp);
    }

    function approveIdentity(address wallet) external onlyRole(ADMIN_ROLE) {
        Identity storage identity = identities[wallet];
        require(identity.status == IdentityStatus.Pending, "Identity: not pending approval");

        identity.status = IdentityStatus.Active;
        identity.updatedAt = block.timestamp;

        emit IdentityApproved(wallet, msg.sender, block.timestamp);
        emit IdentityStatusChanged(wallet, IdentityStatus.Pending, IdentityStatus.Active, msg.sender, block.timestamp);
    }

    function suspendIdentity(address wallet) external onlyRole(ADMIN_ROLE) {
        Identity storage identity = identities[wallet];
        require(identity.status == IdentityStatus.Active, "Identity: must be active to suspend");

        identity.status = IdentityStatus.Suspended;
        identity.updatedAt = block.timestamp;

        emit IdentityStatusChanged(wallet, IdentityStatus.Active, IdentityStatus.Suspended, msg.sender, block.timestamp);
    }

    function reactivateIdentity(address wallet) external onlyRole(ADMIN_ROLE) {
        Identity storage identity = identities[wallet];
        require(identity.status == IdentityStatus.Suspended, "Identity: must be suspended to reactivate");

        identity.status = IdentityStatus.Active;
        identity.updatedAt = block.timestamp;

        emit IdentityStatusChanged(wallet, IdentityStatus.Suspended, IdentityStatus.Active, msg.sender, block.timestamp);
    }

    function revokeIdentity(address wallet) external onlyRole(ADMIN_ROLE) {
        Identity storage identity = identities[wallet];
        require(
            identity.status == IdentityStatus.Active || identity.status == IdentityStatus.Suspended,
            "Identity: cannot revoke from current status"
        );

        IdentityStatus previousStatus = identity.status;
        identity.status = IdentityStatus.Revoked;
        identity.updatedAt = block.timestamp;

        emit IdentityStatusChanged(wallet, previousStatus, IdentityStatus.Revoked, msg.sender, block.timestamp);
    }

    function grantIdentityRole(address wallet, bytes32 role) external onlyRole(ADMIN_ROLE) {
        require(identities[wallet].status == IdentityStatus.Active, "Identity: must be active to receive a role");
        require(
            role == ADMIN_ROLE || role == ISSUER_ROLE || role == VERIFIER_ROLE,
            "Identity: unrecognized role"
        );

        _grantRole(role, wallet);
        emit IdentityRoleGranted(wallet, role, msg.sender);
    }

    function getIdentity(address wallet) external view returns (Identity memory) {
        return identities[wallet];
    }

    function isActive(address wallet) external view returns (bool) {
        return identities[wallet].status == IdentityStatus.Active;
    }
}
