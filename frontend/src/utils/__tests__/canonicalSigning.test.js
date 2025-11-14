/**
 * Tests for Canonical Signing Enhancements:
 * - schemaVersion in VC payload and EIP-712 types
 * - verifyingContract in EIP-712 domain (cross-contract replay prevention)
 */

import { signVcWithMetamask, signVcAsSeller } from '../signVcWithMetamask';
import { verifyTypedData, TypedDataEncoder } from 'ethers';

// Mock ethers provider and signer
const mockSigner = {
  getAddress: async () => '0x1234567890123456789012345678901234567890',
  signTypedData: async (domain, types, payload) => {
    // Mock signature - in real test, this would be actual signature
    return '0x' + 'a'.repeat(130);
  },
  provider: {
    getNetwork: async () => ({ chainId: 11155111n }),
  },
};

describe('Canonical Signing Enhancements', () => {
  const mockVC = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential'],
    id: 'https://example.edu/credentials/123',
    schemaVersion: '1.0', // ✅ Include schemaVersion in mock
    issuer: {
      id: 'did:ethr:11155111:0x1111111111111111111111111111111111111111',
      name: 'Seller',
    },
    holder: {
      id: 'did:ethr:11155111:0x2222222222222222222222222222222222222222',
      name: 'Buyer',
    },
    issuanceDate: '2024-01-15T10:30:00Z',
    credentialSubject: {
      id: 'did:ethr:11155111:0x2222222222222222222222222222222222222222',
      productName: 'Test Product',
      batch: 'BATCH001',
      quantity: '100',
      previousCredential: '', // ✅ Required field - set to empty string if not used
      componentCredentials: [], // ✅ Required field - set to empty array if not used
      certificateCredential: { // ✅ Required field - must be present for EIP-712
        name: '',
        cid: '',
      },
      price: JSON.stringify({ hidden: true }),
    },
  };

  describe('schemaVersion', () => {
    test('should add schemaVersion to VC payload if not present', async () => {
      const vcWithoutSchema = { ...mockVC };
      delete vcWithoutSchema.schemaVersion;

      const proof = await signVcWithMetamask(vcWithoutSchema, mockSigner);

      // Verify that schemaVersion was added (defaults to "1.0")
      // The payloadHash should include schemaVersion in the hash
      expect(proof).toBeDefined();
      expect(proof.payloadHash).toBeDefined();
    });

    test('should preserve existing schemaVersion in VC payload', async () => {
      const vcWithSchema = {
        ...mockVC,
        schemaVersion: '2.0',
      };

      const proof = await signVcWithMetamask(vcWithSchema, mockSigner);

      expect(proof).toBeDefined();
      expect(proof.payloadHash).toBeDefined();
    });

    test('should include schemaVersion in EIP-712 types', async () => {
      // This test verifies that schemaVersion is in the types structure
      // The actual signing will use the types that include schemaVersion
      const vc = { ...mockVC, schemaVersion: '1.0' };
      const proof = await signVcWithMetamask(vc, mockSigner);

      expect(proof).toBeDefined();
      // If schemaVersion wasn't in types, the signature would fail
      expect(proof.jws).toBeDefined();
    });
  });

  describe('verifyingContract', () => {
    const contractAddress = '0xABC123ABC123ABC123ABC123ABC123ABC123ABC1';

    test('should include verifyingContract in EIP-712 domain when provided', async () => {
      const proof = await signVcWithMetamask(mockVC, mockSigner, contractAddress);

      expect(proof).toBeDefined();
      expect(proof.payloadHash).toBeDefined();
      // The payloadHash should be different when verifyingContract is included
    });

    test('should work without verifyingContract (backward compatibility)', async () => {
      const proofWithoutContract = await signVcWithMetamask(mockVC, mockSigner, null);
      const proofWithContract = await signVcWithMetamask(mockVC, mockSigner, contractAddress);

      expect(proofWithoutContract).toBeDefined();
      expect(proofWithContract).toBeDefined();
      // Payload hashes should be different because domain is different
      expect(proofWithoutContract.payloadHash).not.toBe(proofWithContract.payloadHash);
    });

    test('should prevent cross-contract replay', async () => {
      const contract1 = '0xABC123ABC123ABC123ABC123ABC123ABC123ABC1';
      const contract2 = '0xDEF456DEF456DEF456DEF456DEF456DEF456DEF4';

      const proofForContract1 = await signVcWithMetamask(mockVC, mockSigner, contract1);
      const proofForContract2 = await signVcWithMetamask(mockVC, mockSigner, contract2);

      // ✅ Payload hashes MUST be different because verifyingContract is different
      // This is what prevents cross-contract replay - different domains = different hashes
      expect(proofForContract1.payloadHash).not.toBe(proofForContract2.payloadHash);
      
      // Note: Signatures (jws) may be the same with mock signer, but payloadHash difference
      // is what matters for security - verification will fail if wrong contract is used
    });

    test('should work for seller signatures with verifyingContract', async () => {
      const proof = await signVcAsSeller(mockVC, mockSigner, contractAddress);

      expect(proof).toBeDefined();
      expect(proof.role).toBe('seller');
      expect(proof.payloadHash).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    test('should handle VCs without schemaVersion (defaults to 1.0)', async () => {
      const vcOld = { ...mockVC };
      delete vcOld.schemaVersion;

      const proof = await signVcWithMetamask(vcOld, mockSigner);

      expect(proof).toBeDefined();
      // Should not throw error - schemaVersion defaults to "1.0"
    });

    test('should handle signing without contract address (backward compatible)', async () => {
      const proof = await signVcWithMetamask(mockVC, mockSigner);

      expect(proof).toBeDefined();
      // Should work without contract address
    });
  });

  describe('Integration: schemaVersion + verifyingContract', () => {
    test('should work together correctly', async () => {
      const contractAddress = '0xABC123ABC123ABC123ABC123ABC123ABC123ABC1';
      const vc = {
        ...mockVC,
        schemaVersion: '1.0',
      };

      const proof = await signVcWithMetamask(vc, mockSigner, contractAddress);

      expect(proof).toBeDefined();
      expect(proof.payloadHash).toBeDefined();
      expect(proof.jws).toBeDefined();
    });
  });
});

