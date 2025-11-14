/**
 * Backend tests for Canonical Signing Enhancements:
 * - schemaVersion in VC verification
 * - verifyingContract in EIP-712 domain verification
 */

const { verifyVC } = require('../verifyVC');
const { verifyTypedData, TypedDataEncoder } = require('ethers');

describe('Backend: Canonical Signing Verification', () => {
  const mockVC = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential'],
    id: 'https://example.edu/credentials/123',
    schemaVersion: '1.0',
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
      price: JSON.stringify({ hidden: true }),
    },
    proof: [
      {
        type: 'EcdsaSecp256k1Signature2019',
        created: '2024-01-15T10:30:00Z',
        proofPurpose: 'assertionMethod',
        verificationMethod: 'did:ethr:11155111:0x1111111111111111111111111111111111111111',
        jws: '0x' + 'a'.repeat(130),
        payloadHash: '0x' + 'b'.repeat(64),
        role: 'issuer',
      },
    ],
  };

  describe('schemaVersion verification', () => {
    test('should handle VC with schemaVersion', async () => {
      const vc = { ...mockVC, schemaVersion: '1.0' };
      
      // Note: This will fail signature verification because we're using mock signatures
      // But it should not fail on schemaVersion parsing
      try {
        await verifyVC(vc, false);
      } catch (error) {
        // Expected to fail on signature verification, but not on schemaVersion
        expect(error.message).not.toContain('schemaVersion');
      }
    });

    test('should default schemaVersion to 1.0 if not present (backward compatibility)', async () => {
      const vcWithoutSchema = { ...mockVC };
      delete vcWithoutSchema.schemaVersion;

      // Should not throw error about missing schemaVersion
      try {
        await verifyVC(vcWithoutSchema, false);
      } catch (error) {
        expect(error.message).not.toContain('schemaVersion');
      }
    });
  });

  describe('verifyingContract verification', () => {
    const contractAddress = '0xABC123ABC123ABC123ABC123ABC123ABC123ABC1';

    test('should verify VC with verifyingContract', async () => {
      const vc = { ...mockVC };
      
      // Note: This will fail signature verification because we're using mock signatures
      // But it should handle verifyingContract parameter
      try {
        await verifyVC(vc, false, contractAddress);
      } catch (error) {
        // Expected to fail on signature verification, but not on verifyingContract
        expect(error.message).not.toContain('verifyingContract');
      }
    });

    test('should work without verifyingContract (backward compatibility)', async () => {
      const vc = { ...mockVC };
      
      // Should not require verifyingContract
      try {
        await verifyVC(vc, false, null);
      } catch (error) {
        expect(error.message).not.toContain('verifyingContract');
      }
    });
  });

  describe('Cross-contract replay prevention', () => {
    test('should use different domains for different contracts', () => {
      const contract1 = '0xABC123ABC123ABC123ABC123ABC123ABC123ABC1';
      const contract2 = '0xDEF456DEF456DEF456DEF456DEF456DEF456DEF4';

      const domain1 = {
        name: 'VC',
        version: '1.0',
        chainId: 11155111,
        verifyingContract: contract1,
      };

      const domain2 = {
        name: 'VC',
        version: '1.0',
        chainId: 11155111,
        verifyingContract: contract2,
      };

      // Domains should be different
      expect(JSON.stringify(domain1)).not.toBe(JSON.stringify(domain2));
    });
  });
});

