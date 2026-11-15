import IdentityContractArtifact from "../contracts/abis/IdentityContract.json";
import CredentialContractArtifact from "../contracts/abis/CredentialContract.json";
import AccessControlContractArtifact from "../contracts/abis/AccessControlContract.json";

export const CONTRACTS = {
  identity: {
    address: import.meta.env.VITE_IDENTITY_CONTRACT_ADDRESS as string,
    abi: IdentityContractArtifact.abi,
  },
  credential: {
    address: import.meta.env.VITE_CREDENTIAL_CONTRACT_ADDRESS as string,
    abi: CredentialContractArtifact.abi,
  },
  accessControl: {
    address: import.meta.env.VITE_ACCESS_CONTROL_CONTRACT_ADDRESS as string,
    abi: AccessControlContractArtifact.abi,
  },
} as const;

export const EXPECTED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || 31337;
