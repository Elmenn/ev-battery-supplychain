/**
 * Crypto utilities for Railgun wallet mnemonic encryption
 * Uses Web Crypto API with AES-GCM for secure storage
 *
 * Flow:
 * 1. User signs a fixed message with MetaMask
 * 2. Signature is used to derive encryption key via PBKDF2
 * 3. Mnemonic is encrypted with AES-GCM before localStorage storage
 * 4. Same signature always produces same key (deterministic)
 *
 * @module crypto
 */

const SALT_KEY = 'railgun.encryption.salt';
const PBKDF2_ITERATIONS = 100000;

/**
 * Get or create salt for PBKDF2 key derivation
 * Salt is stored in localStorage and persists across sessions
 * @returns {Uint8Array} 16-byte salt
 */
function getOrCreateSalt() {
  try {
    const stored = localStorage.getItem(SALT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return new Uint8Array(parsed);
    }
  } catch (e) {
    // Salt missing or corrupt, generate new one
  }

  // Generate new random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, JSON.stringify(Array.from(salt)));
  return salt;
}

/**
 * Derive AES-256 key from MetaMask signature using PBKDF2
 * Same signature always produces same key (deterministic)
 *
 * @param {string} signature - MetaMask signature (hex string starting with 0x)
 * @param {Uint8Array} salt - Salt for PBKDF2 (optional, uses stored salt if not provided)
 * @returns {Promise<CryptoKey>} AES-GCM encryption key
 */
export async function deriveKeyFromSignature(signature, salt = null) {
  const encoder = new TextEncoder();

  // Use provided salt or get/create stored salt
  const actualSalt = salt || getOrCreateSalt();

  // Import signature as raw key material for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signature),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-256 key using PBKDF2
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: actualSalt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * Encrypt mnemonic using AES-GCM with signature-derived key
 *
 * @param {string} mnemonic - Plaintext mnemonic phrase
 * @param {string} signature - MetaMask signature for key derivation
 * @returns {Promise<Object>} Encrypted payload: { iv: number[], salt: number[], data: number[] }
 */
export async function encryptMnemonic(mnemonic, signature) {
  const encoder = new TextEncoder();

  // Get salt (will create if first time)
  const salt = getOrCreateSalt();

  // Derive encryption key from signature
  const key = await deriveKeyFromSignature(signature, salt);

  // Generate random IV for AES-GCM (12 bytes recommended)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt mnemonic
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(mnemonic)
  );

  // Return as portable arrays (JSON-serializable)
  return {
    iv: Array.from(iv),
    salt: Array.from(salt),
    data: Array.from(new Uint8Array(encryptedBuffer))
  };
}

/**
 * Decrypt mnemonic using AES-GCM with signature-derived key
 * Returns null if decryption fails (wrong signature/key)
 *
 * @param {Object} encryptedPayload - Encrypted data: { iv: number[], salt: number[], data: number[] }
 * @param {string} signature - MetaMask signature for key derivation
 * @returns {Promise<string|null>} Decrypted mnemonic or null on failure
 */
export async function decryptMnemonic(encryptedPayload, signature) {
  try {
    const decoder = new TextDecoder();

    // Extract components from payload
    const iv = new Uint8Array(encryptedPayload.iv);
    const salt = new Uint8Array(encryptedPayload.salt);
    const data = new Uint8Array(encryptedPayload.data);

    // Derive key using same salt as encryption
    const key = await deriveKeyFromSignature(signature, salt);

    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return decoder.decode(decryptedBuffer);
  } catch (err) {
    // Decryption failed - likely wrong key/signature
    console.warn('Mnemonic decryption failed:', err.message);
    return null;
  }
}

const railgunCryptoApi = {
  deriveKeyFromSignature,
  encryptMnemonic,
  decryptMnemonic
};

export default railgunCryptoApi;
