# Blockchain-Based Identity and Access Management (IAM) System

A blockchain-based Identity and Access Management system for secure credential
verification and controlled resource access, built as a production-quality
prototype for an organizational (academic-style) environment.

## Overview

This system replaces fragmented, centrally-trusted identity workflows with a
hybrid on-chain/off-chain architecture: identity proofs, credential hashes,
role/attribute-based access rules, and immutable audit logs live on-chain,
while full documents and personal data remain in protected off-chain storage.

## Core Capabilities

- Identity registration and admin-approved activation
- Credential issuance, revocation, and expiry management
- Role-Based + Attribute-Based Access Control (RBAC + ABAC)
- Delegated verification for internal/external verifiers
- Risk-based access flags and dual-approval for sensitive resources
- Immutable, tamper-evident audit logging
- Document hashing with IPFS-based off-chain storage

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, TailwindCSS, ShadCN UI, React Query, React Hook Form, Zod |
| Backend | Node.js, Express, TypeScript, MongoDB, Mongoose, JWT, Passport, Multer, Winston |
| Blockchain | Solidity, OpenZeppelin, Hardhat, Ethers.js v6, MetaMask |
| Storage | IPFS (Pinata) |
| DevOps | Docker, Docker Compose, GitHub Actions, Render, Vercel, MongoDB Atlas |

## Repository Structure

\`\`\`
apps/
  frontend/       React application
  backend/        Express API server
contracts/        Hardhat project (Solidity smart contracts)
packages/
  shared/         Shared TypeScript types, Zod schemas, contract ABIs
docs/             SRS, SDD, API docs, deployment/user/admin manuals
\`\`\`

## Development Status

🚧 Actively under development. See [project board] and `docs/` for current
progress and design decisions.

## Getting Started

Setup instructions will be added as each module (contracts, backend, frontend)
is completed. See `docs/deployment-guide.md` once available.

## License

TBD

## Module Progress

- [x] Module 0: Repository, tooling, monorepo scaffold
- [x] Module 1: IdentityContract — registration, approval, lifecycle, RBAC (22/22 tests passing)
- [ ] Module 2: CredentialContract
- [ ] Module 3: AccessControlContract
- [ ] Module 4: AuditLogContract
- [ ] Module 5: Backend API
- [ ] Module 6: Frontend
