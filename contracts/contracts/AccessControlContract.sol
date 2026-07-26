// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IIdentityContract {
    function isActive(address wallet) external view returns (bool);
    function hasRole(bytes32 role, address account) external view returns (bool);
}

contract AccessControlContract is AccessControl {
    bytes32 public constant CONTRACT_ADMIN_ROLE = keccak256("CONTRACT_ADMIN_ROLE");

    enum SensitivityLevel {
        Normal,
        Sensitive,
        Critical
    }

    enum RequestStatus {
        None,
        Pending,
        Granted,
        Denied
    }

    struct Resource {
        bytes32 resourceId;
        address owner;
        SensitivityLevel sensitivityLevel;
        bytes32 requiredRole;
        bytes32 requiredAttributeKey;
        bytes32 requiredAttributeValue;
        address approver1;
        address approver2;
        bool exists;
    }

    struct AccessRequest {
        address requester;
        bytes32 resourceId;
        RequestStatus status;
        bool approvedByApprover1;
        bool approvedByApprover2;
        uint256 requestedAt;
        uint256 decidedAt;
    }

    IIdentityContract public identityContract;

    mapping(bytes32 => Resource) private resources;
    mapping(bytes32 => mapping(address => AccessRequest)) private requests;
    mapping(address => mapping(bytes32 => bool)) private grantedAccess;
    mapping(address => mapping(bytes32 => bytes32)) private attributes;

    event IdentityContractUpdated(address indexed oldAddress, address indexed newAddress, address indexed updatedBy);
    event AttributeSet(address indexed wallet, bytes32 indexed key, bytes32 value, address indexed setBy);
    event ResourceRegistered(
        bytes32 indexed resourceId,
        address indexed owner,
        SensitivityLevel sensitivityLevel,
        address indexed registeredBy
    );
    event ApproversUpdated(bytes32 indexed resourceId, address approver1, address approver2, address indexed updatedBy);
    event AccessRequested(bytes32 indexed resourceId, address indexed requester, RequestStatus initialStatus, uint256 timestamp);
    event AccessGranted(bytes32 indexed resourceId, address indexed requester, uint256 timestamp);
    event AccessDenied(bytes32 indexed resourceId, address indexed requester, address indexed deniedBy, uint256 timestamp);
    event AccessRevoked(bytes32 indexed resourceId, address indexed wallet, address indexed revokedBy, uint256 timestamp);

    constructor(address identityContractAddress) {
        require(identityContractAddress != address(0), "AccessControl: identity contract required");

        identityContract = IIdentityContract(identityContractAddress);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(CONTRACT_ADMIN_ROLE, msg.sender);
    }

    function setIdentityContract(address newIdentityContract) external onlyRole(CONTRACT_ADMIN_ROLE) {
        require(newIdentityContract != address(0), "AccessControl: cannot set zero address");

        address oldAddress = address(identityContract);
        identityContract = IIdentityContract(newIdentityContract);

        emit IdentityContractUpdated(oldAddress, newIdentityContract, msg.sender);
    }

    function setAttribute(address wallet, bytes32 key, bytes32 value) external onlyRole(CONTRACT_ADMIN_ROLE) {
        require(identityContract.isActive(wallet), "AccessControl: identity must be active");
        require(key != bytes32(0), "AccessControl: attribute key required");

        attributes[wallet][key] = value;
        emit AttributeSet(wallet, key, value, msg.sender);
    }

    function getAttribute(address wallet, bytes32 key) external view returns (bytes32) {
        return attributes[wallet][key];
    }

    function registerResource(
        bytes32 resourceId,
        address owner,
        SensitivityLevel sensitivityLevel,
        bytes32 requiredRole,
        bytes32 requiredAttributeKey,
        bytes32 requiredAttributeValue,
        address approver1,
        address approver2
    ) external onlyRole(CONTRACT_ADMIN_ROLE) {
        require(!resources[resourceId].exists, "AccessControl: resource already registered");
        require(owner != address(0), "AccessControl: owner required");

        _validateApprovers(sensitivityLevel, approver1, approver2);

        resources[resourceId] = Resource({
            resourceId: resourceId,
            owner: owner,
            sensitivityLevel: sensitivityLevel,
            requiredRole: requiredRole,
            requiredAttributeKey: requiredAttributeKey,
            requiredAttributeValue: requiredAttributeValue,
            approver1: approver1,
            approver2: approver2,
            exists: true
        });

        emit ResourceRegistered(resourceId, owner, sensitivityLevel, msg.sender);
    }

    function updateApprovers(bytes32 resourceId, address approver1, address approver2) external {
        Resource storage resource = resources[resourceId];
        require(resource.exists, "AccessControl: resource does not exist");
        require(
            msg.sender == resource.owner || hasRole(CONTRACT_ADMIN_ROLE, msg.sender),
            "AccessControl: not authorized to update approvers"
        );

        _validateApprovers(resource.sensitivityLevel, approver1, approver2);

        resource.approver1 = approver1;
        resource.approver2 = approver2;

        emit ApproversUpdated(resourceId, approver1, approver2, msg.sender);
    }

    function _validateApprovers(SensitivityLevel level, address approver1, address approver2) internal pure {
        if (level == SensitivityLevel.Normal) {
            require(approver1 == address(0) && approver2 == address(0), "AccessControl: Normal resources cannot have approvers");
        } else if (level == SensitivityLevel.Sensitive) {
            require(approver1 != address(0), "AccessControl: Sensitive resources require one approver");
            require(approver2 == address(0), "AccessControl: Sensitive resources must not set a second approver");
        } else {
            require(approver1 != address(0) && approver2 != address(0), "AccessControl: Critical resources require two approvers");
            require(approver1 != approver2, "AccessControl: Critical approvers must be distinct");
        }
    }

    function _meetsPolicy(address wallet, Resource storage resource) internal view returns (bool) {
        if (!identityContract.isActive(wallet)) return false;

        if (resource.requiredRole != bytes32(0) && !identityContract.hasRole(resource.requiredRole, wallet)) {
            return false;
        }

        if (
            resource.requiredAttributeKey != bytes32(0) &&
            attributes[wallet][resource.requiredAttributeKey] != resource.requiredAttributeValue
        ) {
            return false;
        }

        return true;
    }

    function requestAccess(bytes32 resourceId) external returns (RequestStatus status) {
        Resource storage resource = resources[resourceId];
        require(resource.exists, "AccessControl: resource does not exist");
        require(identityContract.isActive(msg.sender), "AccessControl: requester must be an active identity");

        bool eligible = _meetsPolicy(msg.sender, resource);

        if (!eligible) {
            requests[resourceId][msg.sender] = AccessRequest({
                requester: msg.sender,
                resourceId: resourceId,
                status: RequestStatus.Denied,
                approvedByApprover1: false,
                approvedByApprover2: false,
                requestedAt: block.timestamp,
                decidedAt: block.timestamp
            });

            emit AccessRequested(resourceId, msg.sender, RequestStatus.Denied, block.timestamp);
            emit AccessDenied(resourceId, msg.sender, address(0), block.timestamp);
            return RequestStatus.Denied;
        }

        if (resource.sensitivityLevel == SensitivityLevel.Normal) {
            grantedAccess[msg.sender][resourceId] = true;

            requests[resourceId][msg.sender] = AccessRequest({
                requester: msg.sender,
                resourceId: resourceId,
                status: RequestStatus.Granted,
                approvedByApprover1: false,
                approvedByApprover2: false,
                requestedAt: block.timestamp,
                decidedAt: block.timestamp
            });

            emit AccessRequested(resourceId, msg.sender, RequestStatus.Granted, block.timestamp);
            emit AccessGranted(resourceId, msg.sender, block.timestamp);
            return RequestStatus.Granted;
        }

        requests[resourceId][msg.sender] = AccessRequest({
            requester: msg.sender,
            resourceId: resourceId,
            status: RequestStatus.Pending,
            approvedByApprover1: false,
            approvedByApprover2: false,
            requestedAt: block.timestamp,
            decidedAt: 0
        });

        emit AccessRequested(resourceId, msg.sender, RequestStatus.Pending, block.timestamp);
        return RequestStatus.Pending;
    }

    function approveAccess(bytes32 resourceId, address requester) external {
        Resource storage resource = resources[resourceId];
        require(resource.exists, "AccessControl: resource does not exist");

        AccessRequest storage request = requests[resourceId][requester];
        require(request.status == RequestStatus.Pending, "AccessControl: no pending request for this requester");

        require(
            msg.sender == resource.approver1 || msg.sender == resource.approver2,
            "AccessControl: caller is not a designated approver"
        );

        if (resource.sensitivityLevel == SensitivityLevel.Sensitive) {
            require(msg.sender == resource.approver1, "AccessControl: only the designated approver may approve");

            request.approvedByApprover1 = true;
            request.status = RequestStatus.Granted;
            request.decidedAt = block.timestamp;
            grantedAccess[requester][resourceId] = true;

            emit AccessGranted(resourceId, requester, block.timestamp);
        } else {
            if (msg.sender == resource.approver1) {
                request.approvedByApprover1 = true;
            } else {
                request.approvedByApprover2 = true;
            }

            if (request.approvedByApprover1 && request.approvedByApprover2) {
                request.status = RequestStatus.Granted;
                request.decidedAt = block.timestamp;
                grantedAccess[requester][resourceId] = true;

                emit AccessGranted(resourceId, requester, block.timestamp);
            }
        }
    }

    function denyAccess(bytes32 resourceId, address requester) external {
        Resource storage resource = resources[resourceId];
        require(resource.exists, "AccessControl: resource does not exist");

        AccessRequest storage request = requests[resourceId][requester];
        require(request.status == RequestStatus.Pending, "AccessControl: no pending request for this requester");

        require(
            msg.sender == resource.approver1 || msg.sender == resource.approver2 || hasRole(CONTRACT_ADMIN_ROLE, msg.sender),
            "AccessControl: not authorized to deny this request"
        );

        request.status = RequestStatus.Denied;
        request.decidedAt = block.timestamp;

        emit AccessDenied(resourceId, requester, msg.sender, block.timestamp);
    }

    function revokeAccess(bytes32 resourceId, address wallet) external {
        Resource storage resource = resources[resourceId];
        require(resource.exists, "AccessControl: resource does not exist");
        require(
            msg.sender == resource.owner || hasRole(CONTRACT_ADMIN_ROLE, msg.sender),
            "AccessControl: not authorized to revoke access"
        );
        require(grantedAccess[wallet][resourceId], "AccessControl: access is not currently granted");

        grantedAccess[wallet][resourceId] = false;

        emit AccessRevoked(resourceId, wallet, msg.sender, block.timestamp);
    }

    function hasAccess(address wallet, bytes32 resourceId) external view returns (bool) {
        return grantedAccess[wallet][resourceId];
    }

    function getResource(bytes32 resourceId) external view returns (Resource memory) {
        require(resources[resourceId].exists, "AccessControl: resource does not exist");
        return resources[resourceId];
    }

    function getAccessRequest(bytes32 resourceId, address requester) external view returns (AccessRequest memory) {
        return requests[resourceId][requester];
    }
}
