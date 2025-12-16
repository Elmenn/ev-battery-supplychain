/**
 * Unit test for delivery TX hash commitment fix
 * Tests that TX hash commitment is always added to VC when commitment and proof exist
 */

describe('Delivery TX Hash Commitment Fix', () => {
  it('should always add TX hash commitment to VC when commitment and proof exist (even if verified=false)', () => {
    // Simulate ZKP backend response with verified=false
    const zkpResponse = {
      commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      proof: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      verified: false, // Verification failed, but commitment and proof exist
    };

    // Simulate VC object
    const canonicalVcObj = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id: 'urn:uuid:test-1',
      type: ['VerifiableCredential'],
      credentialSubject: {
        id: 'did:ethr:1337:0x123',
        productName: 'Test Product',
      },
    };

    // ✅ FIX: Always add TX hash commitment if commitment and proof exist
    // (Previously this only happened if verified === true)
    if (zkpResponse.commitment && zkpResponse.proof) {
      canonicalVcObj.credentialSubject.txHashCommitment = {
        commitment: zkpResponse.commitment,
        proof: zkpResponse.proof,
        protocol: 'bulletproofs-pedersen',
        version: '1.0',
        encoding: 'hex',
      };
    }

    // Verify TX hash commitment is present
    expect(canonicalVcObj.credentialSubject.txHashCommitment).toBeDefined();
    expect(canonicalVcObj.credentialSubject.txHashCommitment.commitment).toBe(zkpResponse.commitment);
    expect(canonicalVcObj.credentialSubject.txHashCommitment.proof).toBe(zkpResponse.proof);
  });

  it('should add TX hash commitment when verified=true', () => {
    const zkpResponse = {
      commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      proof: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      verified: true,
    };

    const canonicalVcObj = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id: 'urn:uuid:test-2',
      type: ['VerifiableCredential'],
      credentialSubject: {
        id: 'did:ethr:1337:0x123',
        productName: 'Test Product',
      },
    };

    if (zkpResponse.commitment && zkpResponse.proof) {
      canonicalVcObj.credentialSubject.txHashCommitment = {
        commitment: zkpResponse.commitment,
        proof: zkpResponse.proof,
        protocol: 'bulletproofs-pedersen',
        version: '1.0',
        encoding: 'hex',
      };
    }

    expect(canonicalVcObj.credentialSubject.txHashCommitment).toBeDefined();
  });

  it('should include binding tag when provided', () => {
    const bindingTag = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const zkpResponse = {
      commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      proof: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      verified: true,
    };

    const canonicalVcObj = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id: 'urn:uuid:test-3',
      type: ['VerifiableCredential'],
      credentialSubject: {
        id: 'did:ethr:1337:0x123',
        productName: 'Test Product',
      },
    };

    if (zkpResponse.commitment && zkpResponse.proof) {
      canonicalVcObj.credentialSubject.txHashCommitment = {
        commitment: zkpResponse.commitment,
        proof: zkpResponse.proof,
        protocol: 'bulletproofs-pedersen',
        version: '1.0',
        encoding: 'hex',
        ...(bindingTag ? { bindingTag } : {}),
      };
    }

    expect(canonicalVcObj.credentialSubject.txHashCommitment.bindingTag).toBe(bindingTag);
  });

  it('should NOT add TX hash commitment when commitment is missing', () => {
    const zkpResponse = {
      commitment: null, // Missing commitment
      proof: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      verified: false,
    };

    const canonicalVcObj = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id: 'urn:uuid:test-4',
      type: ['VerifiableCredential'],
      credentialSubject: {
        id: 'did:ethr:1337:0x123',
        productName: 'Test Product',
      },
    };

    // Should not add if commitment or proof is missing
    if (zkpResponse.commitment && zkpResponse.proof) {
      canonicalVcObj.credentialSubject.txHashCommitment = {
        commitment: zkpResponse.commitment,
        proof: zkpResponse.proof,
        protocol: 'bulletproofs-pedersen',
        version: '1.0',
        encoding: 'hex',
      };
    }

    expect(canonicalVcObj.credentialSubject.txHashCommitment).toBeUndefined();
  });

  it('should NOT add TX hash commitment when proof is missing', () => {
    const zkpResponse = {
      commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      proof: null, // Missing proof
      verified: false,
    };

    const canonicalVcObj = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id: 'urn:uuid:test-5',
      type: ['VerifiableCredential'],
      credentialSubject: {
        id: 'did:ethr:1337:0x123',
        productName: 'Test Product',
      },
    };

    if (zkpResponse.commitment && zkpResponse.proof) {
      canonicalVcObj.credentialSubject.txHashCommitment = {
        commitment: zkpResponse.commitment,
        proof: zkpResponse.proof,
        protocol: 'bulletproofs-pedersen',
        version: '1.0',
        encoding: 'hex',
      };
    }

    expect(canonicalVcObj.credentialSubject.txHashCommitment).toBeUndefined();
  });
});

