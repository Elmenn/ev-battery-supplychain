const { performance } = require('perf_hooks');
const { Wallet, TypedDataEncoder, verifyTypedData } = require('ethers');
const {
  preparePayloadForVerification,
  VC_SIGN_PAYLOAD_FORMAT_V4_ERC7984_TYPED,
} = require('../../backend/api/verifyVC');

const CHAIN_ID = 11155111;
const DOMAIN = {
  name: 'VC',
  version: '1.0',
  chainId: CHAIN_ID,
};

const WARMUP_SAMPLES = 5;
const MEASURED_SAMPLES = 15;
const ITERATIONS_PER_SAMPLE = 25;

const SELLER = new Wallet('0x59c6995e998f97a5a0044966f0945382db4d7d9e8f6650c6e458a2cbb2f99d52');
const BUYER = new Wallet('0x8b3a350cf5c34c9194ca3a545d7edc2dcbf86c7f6a80f2ad4a7b5d66f6e5b221');

function didFor(address) {
  return `did:ethr:${CHAIN_ID}:${address.toLowerCase()}`;
}

function buildSampleVrc() {
  return {
    '@context': ['https://www.w3.org/ns/credentials/v2'],
    type: ['VerifiableCredential', 'ERC7984ConfidentialOrderVRC'],
    id: 'urn:uuid:erc7984-signature-benchmark-vrc',
    schemaVersion: '6.1',
    issuer: {
      id: didFor(SELLER.address),
      name: 'Seller',
    },
    holder: {
      id: didFor(BUYER.address),
      name: 'Buyer',
    },
    validFrom: '2026-04-08T12:00:00Z',
    credentialSchema: {
      id: 'urn:ev-battery:erc7984:order-vrc:6.1',
      type: 'JsonSchema',
    },
    credentialStatus: {
      id: 'http://localhost:5000/vc-status/order/order-benchmark',
      type: 'SupplyChainCredentialStatus2026',
      statusPurpose: 'revocation',
    },
    credentialSubject: {
      id: didFor(SELLER.address),
      productName: 'Benchmark Battery Pack',
      batch: 'PACK-ERC7984-BENCH',
      productContract: '0xD06fd5bD93B48424DF7F1D80bF10e7B118283E88',
      productId: 'benchmark-product-1',
      chainId: String(CHAIN_ID),
      listing: {
        unitPriceWei: '200000000000000',
        unitPriceHash: '0x7e4f9af4307a4aaf1c290b2ac5c4c41095a6c7f883f2f4be2d8ddde0a7a8e0b1',
        listingSnapshotCid: 'bafybeigdyrzsigbenchmarklistingcid',
        sellerRailgunAddress: '',
        certificateCredential: {
          name: 'Battery Certificate',
          cid: 'bafybeigdyrzsigbenchmarkcertcid',
        },
        componentCredentials: ['bafybeigdyrzsigbenchmarkcomponentcid'],
      },
      order: {
        orderId: 'order-benchmark-1',
        productId: 'benchmark-product-1',
        escrowAddr: '0xD06fd5bD93B48424DF7F1D80bF10e7B118283E88',
        chainId: String(CHAIN_ID),
        buyerAddress: didFor(BUYER.address),
      },
      commitments: {
        quantityCommitment: '0x1111111111111111111111111111111111111111111111111111111111111111',
        totalCommitment: '0x2222222222222222222222222222222222222222222222222222222222222222',
        paymentCommitment: '0x3333333333333333333333333333333333333333333333333333333333333333',
      },
      settlementPolicy: {
        paymentToken: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
        buyerDepositRequired: true,
        sellerBondPolicy: 'equalToBuyerDeposit',
        transporterBondPolicy: '',
        sellerDeliveryFeePolicy: 'separateConfidentialDeposit',
      },
      equalityAttestations: {
        sellerBond: {
          orderId: 'order-benchmark-1',
          target: 'sellerBondMatchesBuyerDeposit',
          status: 'verified_true',
          handle: '0xabc123',
          requestedAt: 1712577600,
          verifiedAt: 1712577660,
          verifiedTxHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      paymentBridge: {
        version: '1.0',
        bridgeType: 'erc7984-confidential-payment-bridge',
        statement: 'buyerDepositEqualsHiddenTotal',
        contextHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
        bridgeHash: '0x5555555555555555555555555555555555555555555555555555555555555555',
        proofSide: {
          totalCommitment: '0x2222222222222222222222222222222222222222222222222222222222222222',
          contextHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
        },
        depositSide: {
          paymentToken: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
          escrowAddress: '0xD06fd5bD93B48424DF7F1D80bF10e7B118283E88',
          orderId: 'order-benchmark-1',
          buyerAddress: BUYER.address,
          depositTxHash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          depositReference: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        },
        verification: {
          method: 'proof-bound-deposit-reference',
          status: 'bound',
        },
      },
      privacyProofs: {
        quantityTotal: {
          proofType: 'quantity-total-sigma',
          proofRHex: '0x1234',
          proofSHex: '0x5678',
        },
        totalPaymentEquality: {
          proofType: 'total-payment-equality-sigma',
          proofRHex: '0x9abc',
          proofSHex: '0xdef0',
        },
      },
      attestation: {
        attestationVersion: '6.1',
        contextHash: '0x4444444444444444444444444444444444444444444444444444444444444444',
        disclosurePubKey: 'benchmark-pubkey',
        proofSource: {
          type: 'wasm-sidecar',
          orderId: 'order-benchmark-1',
          version: '1.0',
        },
      },
    },
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStats(values) {
  return {
    medianMs: Number(median(values).toFixed(3)),
    meanMs: Number(mean(values).toFixed(3)),
    minMs: Number(Math.min(...values).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}

function extractAddressFromDidIdentifier(identifier) {
  const bare = String(identifier || '').replace(/#.*$/, '');
  const parts = bare.split(':');
  return String(parts[parts.length - 1] || '').toLowerCase();
}

function verifyOneSignature({ proof, expectedDid, payload, types }) {
  const verificationMethod = String(proof.verificationMethod || '');
  const expectedAddress = extractAddressFromDidIdentifier(expectedDid);
  const methodAddress = extractAddressFromDidIdentifier(verificationMethod);

  if (expectedAddress !== methodAddress) {
    throw new Error('DID/address mismatch in proof');
  }

  const payloadHash = TypedDataEncoder.hash(DOMAIN, types, payload);
  if (proof.payloadHash !== payloadHash) {
    throw new Error('Payload hash mismatch');
  }

  const recovered = verifyTypedData(DOMAIN, types, payload, proof.jws).toLowerCase();
  if (recovered !== expectedAddress) {
    throw new Error('Recovered signer mismatch');
  }

  return recovered;
}

async function buildSignedSample() {
  const vc = buildSampleVrc();
  const { payload, types } = preparePayloadForVerification(
    vc,
    VC_SIGN_PAYLOAD_FORMAT_V4_ERC7984_TYPED
  );

  const sellerProof = {
    type: 'EcdsaSecp256k1Signature2019',
    created: '2026-04-08T12:00:00Z',
    proofPurpose: 'assertionMethod',
    verificationMethod: `${didFor(SELLER.address)}#controller`,
    jws: await SELLER.signTypedData(DOMAIN, types, payload),
    payloadHash: TypedDataEncoder.hash(DOMAIN, types, payload),
    payloadFormat: VC_SIGN_PAYLOAD_FORMAT_V4_ERC7984_TYPED,
    role: 'seller',
  };

  const holderProof = {
    type: 'EcdsaSecp256k1Signature2019',
    created: '2026-04-08T12:00:05Z',
    proofPurpose: 'assertionMethod',
    verificationMethod: `${didFor(BUYER.address)}#controller`,
    jws: await BUYER.signTypedData(DOMAIN, types, payload),
    payloadHash: TypedDataEncoder.hash(DOMAIN, types, payload),
    payloadFormat: VC_SIGN_PAYLOAD_FORMAT_V4_ERC7984_TYPED,
    role: 'holder',
  };

  vc.proof = [sellerProof, holderProof];

  return {
    vc,
    payload,
    types,
    sellerProof,
    holderProof,
  };
}

async function main() {
  const sample = await buildSignedSample();

  verifyOneSignature({
    proof: sample.sellerProof,
    expectedDid: sample.payload.issuer.id,
    payload: sample.payload,
    types: sample.types,
  });
  verifyOneSignature({
    proof: sample.holderProof,
    expectedDid: sample.payload.holder.id,
    payload: sample.payload,
    types: sample.types,
  });

  const issuerDurations = [];
  const holderDurations = [];
  const vrcDurations = [];

  const runIssuer = () =>
    verifyOneSignature({
      proof: sample.sellerProof,
      expectedDid: sample.payload.issuer.id,
      payload: sample.payload,
      types: sample.types,
    });

  const runHolder = () =>
    verifyOneSignature({
      proof: sample.holderProof,
      expectedDid: sample.payload.holder.id,
      payload: sample.payload,
      types: sample.types,
    });

  const runVrc = () => {
    runIssuer();
    runHolder();
  };

  const benchmark = (fn, sink) => {
    for (let sampleIndex = 0; sampleIndex < WARMUP_SAMPLES; sampleIndex += 1) {
      for (let i = 0; i < ITERATIONS_PER_SAMPLE; i += 1) {
        fn();
      }
    }

    for (let sampleIndex = 0; sampleIndex < MEASURED_SAMPLES; sampleIndex += 1) {
      const start = performance.now();
      for (let i = 0; i < ITERATIONS_PER_SAMPLE; i += 1) {
        fn();
      }
      const elapsedPerIteration = (performance.now() - start) / ITERATIONS_PER_SAMPLE;
      sink.push(elapsedPerIteration);
    }
  };

  benchmark(runIssuer, issuerDurations);
  benchmark(runHolder, holderDurations);
  benchmark(runVrc, vrcDurations);

  const summary = {
    sample: {
      schemaVersion: sample.vc.schemaVersion,
      payloadFormat: VC_SIGN_PAYLOAD_FORMAT_V4_ERC7984_TYPED,
      signatureCount: sample.vc.proof.length,
      warmupSamples: WARMUP_SAMPLES,
      measuredSamples: MEASURED_SAMPLES,
      iterationsPerSample: ITERATIONS_PER_SAMPLE,
    },
    verification: {
      issuerSignature: {
        samples: MEASURED_SAMPLES,
        ...sampleStats(issuerDurations),
      },
      holderSignature: {
        samples: MEASURED_SAMPLES,
        ...sampleStats(holderDurations),
      },
      fullVrcSignaturePass: {
        samples: MEASURED_SAMPLES,
        ...sampleStats(vrcDurations),
      },
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
