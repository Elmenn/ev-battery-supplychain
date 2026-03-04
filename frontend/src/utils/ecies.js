/**
 * ecies.js — x25519 ECIES encrypt/decrypt for seller→buyer encryptedOpening
 *
 * Construction:
 *   Ephemeral x25519 DH + HKDF-SHA256 key derivation + AES-GCM-256
 *
 * Key byte format: always 64-char lowercase hex strings (32 bytes).
 * HKDF info string: 'ev-supply-chain/opening/v1' (protocol binding)
 */

import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

const HKDF_INFO = new TextEncoder().encode('ev-supply-chain/opening/v1');

// ─── Hex utilities ──────────────────────────────────────────────────────────

function hexToBytes(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string length');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── HKDF + AES-GCM helpers ────────────────────────────────────────────────

async function deriveAesKey(sharedSecret, usage) {
  const aesKeyBytes = hkdf(sha256, sharedSecret, undefined, HKDF_INFO, 32);
  return crypto.subtle.importKey('raw', aesKeyBytes, 'AES-GCM', false, [usage]);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Encrypt a plaintext object to a buyer's x25519 public key.
 * Called by the seller at confirmOrder time.
 *
 * @param {string} buyerPubKeyHex - 32-byte x25519 pubkey as 64-char lowercase hex
 * @param {object} plaintext      - Object to encrypt (e.g., { value, blinding_price })
 * @returns {Promise<{ ciphertext: string, ephemeralPubKey: string, iv: string }>}
 */
export async function encryptOpening(buyerPubKeyHex, plaintext) {
  // 1. Generate ephemeral x25519 keypair
  const ephemPrivKey = x25519.utils.randomPrivateKey();
  const ephemPubKey = x25519.getPublicKey(ephemPrivKey); // Uint8Array 32 bytes

  // 2. DH
  const buyerPubKeyBytes = hexToBytes(buyerPubKeyHex);
  const sharedSecret = x25519.getSharedSecret(ephemPrivKey, buyerPubKeyBytes);

  // 3. AES key via HKDF
  const cryptoKey = await deriveAesKey(sharedSecret, 'encrypt');

  // 4. AES-GCM encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext));
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    plaintextBytes
  );

  return {
    ciphertext: bytesToHex(new Uint8Array(ciphertextBuffer)),
    ephemeralPubKey: bytesToHex(ephemPubKey),
    iv: bytesToHex(iv),
  };
}

/**
 * Decrypt a seller-encrypted opening using the buyer's x25519 private key.
 * Called by the buyer in Workstream A.
 *
 * @param {{ ciphertext: string, ephemeralPubKey: string, iv: string }} encryptedOpening
 * @param {string} buyerPrivKeyHex - 32-byte x25519 private key as 64-char lowercase hex
 * @returns {Promise<object>} Decrypted plaintext object
 * @throws {DOMException} if decryption fails (wrong key or tampered ciphertext)
 */
export async function decryptOpening(encryptedOpening, buyerPrivKeyHex) {
  const ephemPubKeyBytes = hexToBytes(encryptedOpening.ephemeralPubKey);
  const buyerPrivKeyBytes = hexToBytes(buyerPrivKeyHex);

  const sharedSecret = x25519.getSharedSecret(buyerPrivKeyBytes, ephemPubKeyBytes);
  const cryptoKey = await deriveAesKey(sharedSecret, 'decrypt');

  const iv = hexToBytes(encryptedOpening.iv);
  const ciphertextBytes = hexToBytes(encryptedOpening.ciphertext);

  // Throws DOMException if key or ciphertext is wrong — do NOT catch here
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertextBytes
  );

  return JSON.parse(new TextDecoder().decode(plainBuffer));
}

/**
 * Generate a fresh x25519 keypair for a new purchase.
 * Returns { privKeyHex, pubKeyHex } — both 64-char lowercase hex.
 * NEVER derive from wallet signature; always use randomPrivateKey().
 */
export function generateX25519Keypair() {
  const privKey = x25519.utils.randomPrivateKey();
  const pubKey = x25519.getPublicKey(privKey);
  return {
    privKeyHex: bytesToHex(privKey),
    pubKeyHex: bytesToHex(pubKey),
  };
}
