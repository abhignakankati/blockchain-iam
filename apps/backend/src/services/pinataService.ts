import FormData from "form-data";
import axios from "axios";
import { createHash } from "crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const PINATA_UPLOAD_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

interface UploadResult {
  ipfsHash: string; // the IPFS CID
  documentHash: string; // SHA-256 hash of the file content, as a 0x-prefixed hex string
}

/**
 * Uploads a file buffer to IPFS via Pinata, and computes a SHA-256 hash of
 * the exact same buffer that was uploaded. The hash is what gets stored
 * on-chain (via CredentialContract.issueCredential); the IPFS CID is what
 * lets anyone retrieve the actual document later. Hashing the buffer
 * directly (not re-downloading from IPFS afterward) guarantees the hash
 * corresponds to precisely what was pinned - no gap for the file to change
 * in between upload and hash computation.
 */
export async function uploadToIpfs(fileBuffer: Buffer, fileName: string): Promise<UploadResult> {
  const documentHash = "0x" + createHash("sha256").update(fileBuffer).digest("hex");

  const formData = new FormData();
  formData.append("file", fileBuffer, { filename: fileName });

  try {
    const response = await axios.post(PINATA_UPLOAD_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${env.PINATA_JWT}`,
      },
      maxBodyLength: Infinity,
    });

    const ipfsHash = response.data.IpfsHash;
    logger.info("File uploaded to IPFS", { ipfsHash, fileName });

    return { ipfsHash, documentHash };
  } catch (error) {
    logger.error("IPFS upload failed", { error, fileName });
    throw new Error("Failed to upload document to IPFS");
  }
}
