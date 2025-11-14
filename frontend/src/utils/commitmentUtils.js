import { ethers, getAddress, solidityPackedKeccak256 } from "ethers";

/**
 * Generate deterministic blinding factor for Pedersen commitment
 * This ensures seller and buyer generate the same commitment for the same product
 * 
 * @param {string} productAddress - Escrow contract address (checksummed)
 * @param {string} sellerAddress - Seller's EOA address (checksummed)
 * @returns {string} - 32-byte hex string (64 hex chars, no 0x prefix) for blinding factor
 */
export function generateDeterministicBlinding(productAddress, sellerAddress) {
  if (!productAddress || !sellerAddress) {
    throw new Error("productAddress and sellerAddress are required");
  }

  // Normalize addresses to checksum format
  const normalizedProduct = getAddress(productAddress);
  const normalizedSeller = getAddress(sellerAddress);

  // Use keccak256 of productAddress + sellerAddress as deterministic seed
  // This produces a 32-byte value that can be used as a scalar
  const seed = solidityPackedKeccak256(
    ['address', 'address'],
    [normalizedProduct, normalizedSeller]
  );

  // Remove 0x prefix and return as hex string (64 chars)
  return seed.slice(2);
}

/**
 * Generate Pedersen commitment using deterministic blinding
 * Calls ZKP backend with value and deterministic blinding factor
 * 
 * @param {number|string|bigint} value - Value to commit to (will be converted to u64)
 * @param {string} productAddress - Escrow contract address
 * @param {string} sellerAddress - Seller's EOA address
 * @param {string} zkpBackendUrl - ZKP backend URL (default: http://localhost:5010)
 * @returns {Promise<{commitment: string, proof: string, verified: boolean}>}
 */
export async function generateCommitmentWithDeterministicBlinding(
  value,
  productAddress,
  sellerAddress,
  zkpBackendUrl = 'http://localhost:5010'
) {
  // Generate deterministic blinding
  const blindingHex = generateDeterministicBlinding(productAddress, sellerAddress);

  // Convert value to u64 (ensure it's a number)
  const valueNum = typeof value === 'bigint' ? Number(value) : Number(value);
  if (isNaN(valueNum) || valueNum < 0 || valueNum > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Invalid value: ${value}. Must be a valid u64 number`);
  }

  // Call ZKP backend with value and blinding
  const response = await fetch(`${zkpBackendUrl}/zkp/generate-value-commitment-with-blinding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      value: valueNum,
      blinding_hex: `0x${blindingHex}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ZKP backend error: ${errorText}`);
  }

  const data = await response.json();
  return {
    commitment: data.commitment,
    proof: data.proof,
    verified: data.verified,
  };
}

/**
 * Generate Pedersen commitment with binding tag
 * Calls ZKP backend with value, deterministic blinding factor, and binding tag
 * 
 * @param {number|string|bigint} value - Value to commit to (will be converted to u64)
 * @param {string} productAddress - Escrow contract address
 * @param {string} sellerAddress - Seller's EOA address
 * @param {string|number} chainId - Chain ID (e.g., 11155111 for Sepolia, 1337 for local)
 * @param {string|number|bigint} productId - Product ID from contract
 * @param {number} stage - VC stage (0 = Product Listing, 1 = Order Confirmation, 2 = Delivery Credential)
 * @param {string} schemaVersion - VC schema version (default: "1.0")
 * @param {string|null} previousVCCid - Previous VC CID (optional, for Stage 2+)
 * @param {string} zkpBackendUrl - ZKP backend URL (default: http://localhost:5010)
 * @returns {Promise<{commitment: string, proof: string, verified: boolean, bindingTag: string}>}
 */
export async function generateCommitmentWithBindingTag(
  value,
  productAddress,
  sellerAddress,
  chainId,
  productId,
  stage,
  schemaVersion = "1.0",
  previousVCCid = null,
  zkpBackendUrl = 'http://localhost:5010'
) {
  // Generate deterministic blinding
  const blindingHex = generateDeterministicBlinding(productAddress, sellerAddress);

  // Generate binding tag
  const bindingTag = generateBindingTag({
    chainId,
    escrowAddr: productAddress,
    productId,
    stage,
    schemaVersion,
    previousVCCid,
  });

  // Convert value to u64 (ensure it's a number)
  const valueNum = typeof value === 'bigint' ? Number(value) : typeof value === 'string' ? Number(value) : value;
  if (isNaN(valueNum) || valueNum < 0 || valueNum > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Invalid value: ${value}. Must be a valid u64 number`);
  }

  // Call ZKP backend with value, blinding, and binding tag
  const response = await fetch(`${zkpBackendUrl}/zkp/generate-value-commitment-with-binding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      value: valueNum,
      blinding_hex: `0x${blindingHex}`,
      binding_tag_hex: `0x${bindingTag}`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ZKP backend error: ${errorText}`);
  }

  const data = await response.json();
  return {
    commitment: data.commitment,
    proof: data.proof,
    verified: data.verified,
    bindingTag: `0x${bindingTag}`, // Return with 0x prefix for consistency
  };
}

/**
 * Verify that a commitment matches the on-chain stored commitment
 * 
 * @param {string} vcCommitment - Commitment from VC (hex string)
 * @param {string} onChainCommitment - Commitment from contract (hex string)
 * @returns {boolean} - True if commitments match (case-insensitive comparison)
 */
export function verifyCommitmentMatch(vcCommitment, onChainCommitment) {
  if (!vcCommitment || !onChainCommitment) {
    return false;
  }

  // Normalize hex strings (remove 0x prefix, lowercase)
  const normalizedVc = vcCommitment.toLowerCase().replace(/^0x/, '');
  const normalizedOnChain = onChainCommitment.toLowerCase().replace(/^0x/, '');

  return normalizedVc === normalizedOnChain;
}

/**
 * Generate binding tag for ZKP proof
 * Binds proof to VC context to prevent replay attacks and proof swapping
 * 
 * @param {string|number} chainId - Chain ID (e.g., 11155111 for Sepolia, 1337 for local)
 * @param {string} escrowAddr - Product escrow contract address (checksummed)
 * @param {string|number|bigint} productId - Product ID from contract
 * @param {number} stage - VC stage (0 = Product Listing, 1 = Order Confirmation, 2 = Delivery Credential)
 * @param {string} schemaVersion - VC schema version (default: "1.0")
 * @param {string|null} previousVCCid - Previous VC CID (optional, for Stage 2+)
 * @returns {string} - 32-byte hex string (64 hex chars, no 0x prefix) for binding tag
 */
export function generateBindingTag({
  chainId,
  escrowAddr,
  productId,
  stage,
  schemaVersion = "1.0",
  previousVCCid = null,
}) {
  // Validate required parameters
  if (!chainId || !escrowAddr || productId === undefined || productId === null || stage === undefined || stage === null) {
    throw new Error("chainId, escrowAddr, productId, and stage are required for binding tag generation");
  }

  // Normalize addresses
  const normalizedEscrow = getAddress(escrowAddr);
  
  // Convert chainId to number
  const chainIdNum = typeof chainId === 'string' ? parseInt(chainId, 10) : Number(chainId);
  if (isNaN(chainIdNum)) {
    throw new Error(`Invalid chainId: ${chainId}. Must be a valid number`);
  }

  // Convert productId to number
  const productIdNum = typeof productId === 'bigint' ? Number(productId) : Number(productId);
  if (isNaN(productIdNum)) {
    throw new Error(`Invalid productId: ${productId}. Must be a valid number`);
  }

  // Convert stage to number
  const stageNum = Number(stage);
  if (isNaN(stageNum) || stageNum < 0 || stageNum > 2) {
    throw new Error(`Invalid stage: ${stage}. Must be 0, 1, or 2`);
  }

  // Validate schemaVersion
  if (!schemaVersion || typeof schemaVersion !== 'string') {
    throw new Error(`Invalid schemaVersion: ${schemaVersion}. Must be a string`);
  }

  // Build binding tag components
  // Protocol version: v1 = context-based (without current VC CID), v2 = with previous VC CID
  const protocolVersion = previousVCCid ? 'zkp-bind-v2' : 'zkp-bind-v1';
  
  // Generate binding tag using keccak256
  let bindingTag;
  if (previousVCCid) {
    // Version 2: Include previous VC CID (for Stage 2+)
    bindingTag = solidityPackedKeccak256(
      ['string', 'uint256', 'address', 'uint256', 'uint8', 'string', 'string'],
      [
        protocolVersion,
        chainIdNum,
        normalizedEscrow,
        productIdNum,
        stageNum,
        schemaVersion,
        previousVCCid,
      ]
    );
  } else {
    // Version 1: Context-based (for Stage 0, or when previous VC CID is not available)
    bindingTag = solidityPackedKeccak256(
      ['string', 'uint256', 'address', 'uint256', 'uint8', 'string'],
      [
        protocolVersion,
        chainIdNum,
        normalizedEscrow,
        productIdNum,
        stageNum,
        schemaVersion,
      ]
    );
  }

  // Remove 0x prefix and return as hex string (64 chars)
  return bindingTag.slice(2);
}

