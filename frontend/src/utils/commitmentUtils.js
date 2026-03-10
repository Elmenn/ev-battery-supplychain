import {
  AbiCoder,
  getAddress,
  hexlify,
  keccak256,
  randomBytes,
  solidityPackedKeccak256,
} from "ethers";
import {
  generateValueCommitmentWithBinding,
  generateValueCommitmentWithBlinding,
} from "./zkp/zkpClient";

const abiCoder = AbiCoder.defaultAbiCoder();
const MAX_U64 = (1n << 64n) - 1n;
const MAX_CURVE25519_SCALAR =
  7237005577332262213973186563042994240857116359379907606001950938285454250988n;

export function normalizeIntegerString(value, fieldName = "value") {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${fieldName} must be non-negative`);
    }
    return value.toString();
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${fieldName} must be a non-negative integer`);
    }
    return String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`${fieldName} must be a decimal integer string`);
    }
    return trimmed;
  }

  throw new Error(`${fieldName} must be a bigint, integer number, or decimal string`);
}

export function assertU64Value(value, fieldName = "value") {
  const normalized = normalizeIntegerString(value, fieldName);
  const asBigInt = BigInt(normalized);
  if (asBigInt > MAX_U64) {
    throw new Error(`${fieldName} exceeds the current 64-bit commitment backend limit`);
  }
  return normalized;
}

export function assertScalarValue(value, fieldName = "value") {
  const normalized = normalizeIntegerString(value, fieldName);
  const asBigInt = BigInt(normalized);
  if (asBigInt > MAX_CURVE25519_SCALAR) {
    throw new Error(`${fieldName} exceeds the current scalar commitment backend limit`);
  }
  return normalized;
}

export function computeUnitPriceHash(unitPriceWei) {
  const normalizedUnitPrice = normalizeIntegerString(unitPriceWei, "unitPriceWei");
  return keccak256(abiCoder.encode(["uint256"], [normalizedUnitPrice]));
}

export function ensureHexPrefix(value) {
  if (typeof value !== "string") {
    throw new Error("hex value must be a string");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("hex value must not be empty");
  }
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

export function normalizeBytes32Hex(value, fieldName = "value") {
  const normalized = ensureHexPrefix(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${fieldName} must be a 32-byte hex string`);
  }
  return normalized;
}

export function generateOrderId() {
  return hexlify(randomBytes(32));
}

export function computeOrderContextHash({
  orderId,
  memoHash,
  railgunTxRef,
  productId,
  chainId,
  escrowAddr,
  unitPriceHash,
}) {
  return keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "uint256", "address", "bytes32"],
      [
        orderId,
        memoHash,
        railgunTxRef,
        normalizeIntegerString(productId, "productId"),
        normalizeIntegerString(chainId, "chainId"),
        getAddress(escrowAddr),
        unitPriceHash,
      ]
    )
  );
}

export function multiplyIntegerStrings(leftValue, rightValue, fieldName = "value") {
  const left = BigInt(normalizeIntegerString(leftValue, `${fieldName}Left`));
  const right = BigInt(normalizeIntegerString(rightValue, `${fieldName}Right`));
  return (left * right).toString();
}

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

  const normalizedValue = assertU64Value(value, "value");

  const data = await generateValueCommitmentWithBlinding({
    value: normalizedValue,
    blindingHex: `0x${blindingHex}`,
    zkpBackendUrl,
  });
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

  const normalizedValue = assertU64Value(value, "value");

  const data = await generateValueCommitmentWithBinding({
    value: normalizedValue,
    blindingHex: `0x${blindingHex}`,
    bindingTagHex: `0x${bindingTag}`,
    zkpBackendUrl,
  });
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

/**
 * Generate binding tag for TX hash commitments (Feature 2: Linkable Commitment)
 * This creates a deterministic binding tag that links purchase and delivery TX commitments
 * 
 * @param {string|number} chainId - Chain ID (e.g., 11155111 for Sepolia, 1337 for local)
 * @param {string} escrowAddr - Product escrow contract address (checksummed)
 * @param {string|number|bigint} productId - Product ID from contract
 * @param {string} buyerAddress - Buyer's EOA address (checksummed)
 * @returns {string} - 32-byte hex string (64 hex chars, no 0x prefix) for binding tag
 */
export function generateTxHashCommitmentBindingTag({
  chainId,
  escrowAddr,
  productId,
  buyerAddress,
}) {
  // Validate required parameters
  if (!chainId || !escrowAddr || productId === undefined || productId === null || !buyerAddress) {
    throw new Error("chainId, escrowAddr, productId, and buyerAddress are required for TX hash commitment binding tag");
  }

  // Normalize addresses
  const normalizedEscrow = getAddress(escrowAddr);
  const normalizedBuyer = getAddress(buyerAddress);
  
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

  // Generate binding tag using keccak256
  // Protocol version: tx-hash-bind-v1 = for linking purchase and delivery TX commitments
  const protocolVersion = 'tx-hash-bind-v1';
  
  const bindingTag = solidityPackedKeccak256(
    ['string', 'uint256', 'address', 'uint256', 'address'],
    [
      protocolVersion,
      chainIdNum,
      normalizedEscrow,
      productIdNum,
      normalizedBuyer,
    ]
  );

  // Remove 0x prefix and return as hex string (64 chars)
  return bindingTag.slice(2);
}

/**
 * Generate a random 32-byte blinding factor for C_pay.
 * Returns a 64-char lowercase hex string (no 0x prefix).
 * Uses crypto.getRandomValues for cryptographic randomness.
 *
 * IMPORTANT: Store the exact returned hex in the buyer-secret blob.
 * The ZKP backend uses Scalar::from_bytes_mod_order() to reduce it —
 * do NOT apply any JS-side transformation before sending to the backend.
 */
export function generateRandomBlinding() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Open the seller's encryptedOpening and verify that C_price matches the reconstructed commitment.
 * This is the core of Workstream A (buyer local verification).
 *
 * Steps:
 *   1. Call generateValueCommitmentWithBlinding({ value, blindingHex: blinding_price })
 *   2. Compare the resulting commitment hex against vc.credentialSubject.priceCommitment.commitment
 *
 * @param {object} params
 * @param {number} params.value           - Price value (from decrypted encryptedOpening)
 * @param {string} params.blindingPrice   - 32-byte hex blinding factor (from decrypted encryptedOpening)
 * @param {string} params.cPriceHex       - Expected C_price commitment hex (from VC)
 * @returns {Promise<{ verified: boolean, cCheck: string }>}
 */
export async function openAndVerifyCommitment({ value, blindingPrice, cPriceHex }) {
  const normalizedValue = assertU64Value(value, "value");
  const result = await generateValueCommitmentWithBlinding({
    value: normalizedValue,
    blindingHex: blindingPrice.startsWith('0x') ? blindingPrice : `0x${blindingPrice}`,
  });

  const normalizedCheck = result.commitment.toLowerCase().replace(/^0x/, '');
  const normalizedExpected = cPriceHex.toLowerCase().replace(/^0x/, '');

  return {
    verified: normalizedCheck === normalizedExpected,
    cCheck: result.commitment,
  };
}
