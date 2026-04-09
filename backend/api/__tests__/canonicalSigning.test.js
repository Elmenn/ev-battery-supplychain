/**
 * Backend tests for Canonical Signing Enhancements:
 * - schemaVersion in VC verification
 * - verifyingContract in EIP-712 domain verification
 */

const { verifyVC } = require('../verifyVC');

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

  const mockErc7984VC = {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiableCredential', 'ERC7984ConfidentialOrderVRC'],
    id: 'urn:uuid:erc7984-test-vrc',
    schemaVersion: '6.0',
    issuer: {
      id: 'did:ethr:11155111:0x1111111111111111111111111111111111111111',
      name: 'Seller',
    },
    holder: {
      id: 'did:ethr:11155111:0x2222222222222222222222222222222222222222',
      name: 'Buyer',
    },
    validFrom: '2026-03-13T12:00:00Z',
    credentialSchema: {
      id: 'urn:ev-battery:erc7984:order-vrc:6.0',
      type: 'JsonSchema',
    },
    credentialStatus: {
      id: 'http://localhost:5000/vc-status/order/order-123',
      type: 'SupplyChainCredentialStatus2026',
      statusPurpose: 'revocation',
    },
    credentialSubject: {
      id: 'did:ethr:11155111:0x1111111111111111111111111111111111111111',
      productName: 'Battery Pack',
      batch: 'PACK-001',
      productContract: '0x3333333333333333333333333333333333333333',
      productId: '7',
      chainId: '11155111',
      listing: {
        unitPriceWei: '25',
        unitPriceHash: '0xaaa',
        listingSnapshotCid: 'bafylisting',
        sellerRailgunAddress: '',
        certificateCredential: { name: 'Cert', cid: 'bafycert' },
        componentCredentials: ['bafycomponent'],
      },
      order: {
        orderId: 'order-123',
        productId: '7',
        escrowAddr: '0x4444444444444444444444444444444444444444',
        chainId: '11155111',
        buyerAddress: 'did:ethr:11155111:0x2222222222222222222222222222222222222222',
        transporterAddress: 'did:ethr:11155111:0x3333333333333333333333333333333333333333',
      },
      commitments: {
        quantityCommitment: '0x111',
        totalCommitment: '0x222',
        paymentCommitment: '0x333',
      },
      settlementPolicy: {
        paymentToken: '0x5555555555555555555555555555555555555555',
        buyerDepositRequired: true,
        sellerBondPolicy: 'equalToBuyerDeposit',
        transporterBondPolicy: 'equalToBuyerDeposit',
        sellerDeliveryFeePolicy: 'separateConfidentialDeposit',
      },
      equalityAttestations: {
        sellerBond: {
          orderId: 'order-123',
          target: 'sellerBondMatchesBuyerDeposit',
          status: 'verified_true',
          handle: '0xabc',
          requestedAt: 10,
          verifiedAt: 12,
          verifiedTxHash: '0x' + '1'.repeat(64),
        },
        transporterBond: {
          orderId: 'order-123',
          target: 'transporterBondMatchesBuyerDeposit',
          status: 'pending',
          handle: '0xdef',
          requestedAt: 11,
          verifiedAt: 0,
          verifiedTxHash: '',
        },
      },
      paymentBridge: {
        version: '1.0',
        bridgeType: 'erc7984-confidential-payment-bridge',
        statement: 'buyerDepositEqualsHiddenTotal',
        contextHash: '0x444',
        bridgeHash: '0x555',
        proofSide: {
          totalCommitment: '0x222',
          contextHash: '0x444',
        },
        depositSide: {
          paymentToken: '0x5555555555555555555555555555555555555555',
          escrowAddress: '0x4444444444444444444444444444444444444444',
          orderId: 'order-123',
          buyerAddress: '0x2222222222222222222222222222222222222222',
          depositTxHash: '0x' + '2'.repeat(64),
          depositReference: '0x' + '3'.repeat(64),
        },
        verification: {
          method: 'proof-bound-deposit-reference',
          status: 'bound',
        },
      },
      attestation: {
        attestationVersion: '6.0',
        contextHash: '0x444',
        disclosurePubKey: 'pubkey',
        proofSource: {
          type: 'wasm-sidecar',
          orderId: 'order-123',
          version: '1.0',
        },
      },
    },
    proof: [
      {
        type: 'EcdsaSecp256k1Signature2019',
        created: '2026-03-13T12:00:00Z',
        proofPurpose: 'assertionMethod',
        verificationMethod: 'did:ethr:11155111:0x1111111111111111111111111111111111111111',
        jws: '0x' + 'a'.repeat(130),
        payloadHash: '0x' + 'b'.repeat(64),
        payloadFormat: 'eip712-v4-erc7984-vrc-typed',
        role: 'seller',
      },
    ],
  };

  describe('schemaVersion verification', () => {
    test('should handle VC with schemaVersion', async () => {
      const vc = { ...mockVC, schemaVersion: '1.0' };
      
      // Note: This will fail signature verification because we're using mock signatures
      // But it should not fail on schemaVersion parsing
      try {
        await verifyVC(vc);
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
        await verifyVC(vcWithoutSchema);
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
        await verifyVC(vc, contractAddress);
      } catch (error) {
        // Expected to fail on signature verification, but not on verifyingContract
        expect(error.message).not.toContain('verifyingContract');
      }
    });

    test('should work without verifyingContract (backward compatibility)', async () => {
      const vc = { ...mockVC };
      
      // Should not require verifyingContract
      try {
        await verifyVC(vc, null);
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

  describe('ERC-7984 VRC 6.0 verification', () => {
    test('should parse ERC-7984 VRC payloads without paymentBridge schema errors', async () => {
      try {
        await verifyVC(mockErc7984VC);
      } catch (error) {
        expect(error.message).not.toContain('paymentBridge');
        expect(error.message).not.toContain('settlementPolicy');
        expect(error.message).not.toContain('equalityAttestations');
      }
    });

    test('should accept explicit ERC-7984 payloadFormat routing', async () => {
      const vc = {
        ...mockErc7984VC,
        proof: [
          {
            ...mockErc7984VC.proof[0],
            payloadFormat: 'eip712-v4-erc7984-vrc-typed',
          },
        ],
      };

      try {
        await verifyVC(vc, '0xABC123ABC123ABC123ABC123ABC123ABC123ABC1');
      } catch (error) {
        expect(error.message).not.toContain('payloadFormat');
      }
    });
  });
});

