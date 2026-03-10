const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase14-02-api-'));
process.env.DB_PATH = path.join(tempDir, 'metadata.sqlite');
process.env.VC_STATUS_ADMIN_TOKEN = 'test-status-token';

const { app, computeCanonicalContextHash } = require('./server');

let server;
let baseUrl;

async function postJson(route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response;
}

async function patchJson(route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response;
}

async function getJson(route) {
  return fetch(`${baseUrl}${route}`);
}

test.before(async () => {
  server = app.listen(0);
  await once(server, 'listening');
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('legacy metadata route still works with additive schema fields', async () => {
  const productAddress = '0x1234567890ABCDEF1234567890ABCDEF12345678';
  const response = await postJson('/metadata', {
    productAddress,
    productMeta: { name: 'Legacy Product' },
    priceWei: '1000000000000000000',
    priceCommitment: '0x' + '11'.repeat(32),
    sellerRailgunAddress: '0zk-legacy',
    unitPriceWei: '250000000000000000',
    unitPriceHash: '0x' + '22'.repeat(32),
    schemaVersion: '2.0',
  });

  assert.equal(response.status, 201);
  const getResponse = await getJson(`/metadata/${productAddress}`);
  assert.equal(getResponse.status, 200);
  const payload = await getResponse.json();
  assert.equal(payload.productAddress, productAddress.toLowerCase());
  assert.equal(payload.unitPriceHash, ('0x' + '22'.repeat(32)).toLowerCase());
  assert.equal(payload.schemaVersion, '2.0');
});

test('order routes persist by orderId and compute canonical contextHash', async () => {
  const context = {
    orderId: '0x' + 'aa'.repeat(32),
    memoHash: '0x' + 'bb'.repeat(32),
    railgunTxRef: '0x' + 'cc'.repeat(32),
    productId: '42',
    chainId: '11155111',
    escrowAddr: '0x1234567890ABCDEF1234567890ABCDEF12345678',
    unitPriceHash: '0x' + 'dd'.repeat(32),
  };

  const expectedContextHash = computeCanonicalContextHash(context);
  const createResponse = await postJson('/orders', {
    orderId: context.orderId.toUpperCase(),
    productAddress: context.escrowAddr.toUpperCase(),
    productId: context.productId,
    escrowAddress: context.escrowAddr.toUpperCase(),
    chainId: context.chainId,
    sellerAddress: '0x1111111111111111111111111111111111111111',
    buyerAddress: '0x2222222222222222222222222222222222222222',
    status: 'paid_private',
    memoHash: context.memoHash,
    railgunTxRef: context.railgunTxRef,
    unitPriceWei: '250000000000000000',
    unitPriceHash: context.unitPriceHash,
    quantityCommitment: '0x' + '01'.repeat(32),
    totalCommitment: '0x' + '02'.repeat(32),
    paymentCommitment: '0x' + '03'.repeat(32),
    context,
  });

  assert.equal(createResponse.status, 201);
  const createPayload = await createResponse.json();
  assert.equal(createPayload.order.contextHash, expectedContextHash);
  assert.equal(createPayload.order.productAddress, context.escrowAddr.toLowerCase());

  const getResponse = await getJson(`/orders/${context.orderId}`);
  assert.equal(getResponse.status, 200);
  const getPayload = await getResponse.json();
  assert.equal(getPayload.contextHash, expectedContextHash);
  assert.equal(getPayload.status, 'paid_private');

  const patchStatus = await patchJson(`/orders/${context.orderId}/status`, {
    status: 'order_confirmed',
  });
  assert.equal(patchStatus.status, 200);
  const patchStatusPayload = await patchStatus.json();
  assert.equal(patchStatusPayload.order.status, 'order_confirmed');

  const patchVc = await patchJson(`/orders/${context.orderId}/vc-cid`, {
    vcCid: 'bafy-order-vc',
    vcHash: '0x' + '04'.repeat(32),
  });
  assert.equal(patchVc.status, 200);
  const patchVcPayload = await patchVc.json();
  assert.equal(patchVcPayload.order.orderVcCid, 'bafy-order-vc');
  assert.equal(patchVcPayload.order.orderVcHash, ('0x' + '04'.repeat(32)).toLowerCase());
});

test('order attestation routes store and patch proof bundles by orderId', async () => {
  const orderId = '0x' + 'ef'.repeat(32);

  const createResponse = await postJson('/order-attestations', {
    orderId,
    productAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678',
    buyerAddress: '0x2222222222222222222222222222222222222222',
    encryptedBlob: { ciphertext: 'blob' },
    disclosurePubkey: 'buyer-pubkey',
    quantityTotalProof: { proof_r_hex: '0x01', proof_s_hex: '0x02' },
  });

  assert.equal(createResponse.status, 201);
  const createPayload = await createResponse.json();
  assert.equal(createPayload.attestation.orderId, orderId);
  assert.deepEqual(createPayload.attestation.quantityTotalProof, {
    proof_r_hex: '0x01',
    proof_s_hex: '0x02',
  });

  const patchResponse = await patchJson(`/order-attestations/${orderId}/proof-bundle`, {
    encryptedQuantityOpening: { ciphertext: 'qty' },
    encryptedTotalOpening: { ciphertext: 'total' },
    paymentEqualityProof: { proof_r_hex: '0x03', proof_s_hex: '0x04' },
    proofBundle: {
      schemaVersion: '1.0',
      contextHash: '0x' + '99'.repeat(32),
    },
  });

  assert.equal(patchResponse.status, 200);
  const patchPayload = await patchResponse.json();
  assert.deepEqual(patchPayload.attestation.paymentEqualityProof, {
    proof_r_hex: '0x03',
    proof_s_hex: '0x04',
  });
  assert.deepEqual(patchPayload.attestation.proofBundle, {
    schemaVersion: '1.0',
    contextHash: '0x' + '99'.repeat(32),
  });

  const getResponse = await getJson(`/order-attestations/${orderId}`);
  assert.equal(getResponse.status, 200);
  const getPayload = await getResponse.json();
  assert.deepEqual(getPayload.encryptedQuantityOpening, { ciphertext: 'qty' });
  assert.deepEqual(getPayload.encryptedTotalOpening, { ciphertext: 'total' });
});

test('order recovery bundle writes order and attestation atomically', async () => {
  const orderId = '0x' + 'ab'.repeat(32);
  const response = await postJson('/orders/recovery-bundle', {
    order: {
      orderId,
      productAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      productId: '77',
      escrowAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      chainId: '11155111',
      sellerAddress: '0x1111111111111111111111111111111111111111',
      buyerAddress: '0x2222222222222222222222222222222222222222',
      status: 'payment_pending_recording',
      memoHash: '0x' + '10'.repeat(32),
      railgunTxRef: '0x' + '11'.repeat(32),
      unitPriceWei: '250000000000000000',
      unitPriceHash: '0x' + '12'.repeat(32),
      quantityCommitment: '0x' + '13'.repeat(32),
      totalCommitment: '0x' + '14'.repeat(32),
      paymentCommitment: '0x' + '15'.repeat(32),
      context: {
        orderId,
        memoHash: '0x' + '10'.repeat(32),
        railgunTxRef: '0x' + '11'.repeat(32),
        productId: '77',
        chainId: '11155111',
        escrowAddr: '0x1234567890ABCDEF1234567890ABCDEF12345678',
        unitPriceHash: '0x' + '12'.repeat(32),
      },
    },
    attestation: {
      disclosurePubkey: 'pubkey-1',
      encryptedBlob: { ciphertext: 'blob' },
      quantityTotalProof: { proof_r_hex: '0x01', proof_s_hex: '0x02' },
    },
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.order.status, 'payment_pending_recording');
  assert.equal(payload.attestation.disclosurePubkey, 'pubkey-1');
});

test('reconcile route rebuilds order row from chain snapshot and metadata', async () => {
  const productAddress = '0x9999999999999999999999999999999999999999';
  const orderId = '0x' + 'cd'.repeat(32);

  const metadataResponse = await postJson('/metadata', {
    productAddress,
    productMeta: {
      productId: '88',
      chainId: '11155111',
      sellerAddr: '0x1111111111111111111111111111111111111111',
      unitPriceWei: '500000000000000000',
      unitPriceHash: '0x' + '21'.repeat(32),
    },
    unitPriceWei: '500000000000000000',
    unitPriceHash: '0x' + '21'.repeat(32),
    sellerRailgunAddress: '0zk-seller',
    schemaVersion: '3.0',
  });
  assert.equal(metadataResponse.status, 201);

  const reconcileResponse = await postJson(`/orders/${orderId}/reconcile`, {
    productAddress,
    onChainOrder: {
      buyerAddress: '0x2222222222222222222222222222222222222222',
      memoHash: '0x' + '31'.repeat(32),
      railgunTxRef: '0x' + '32'.repeat(32),
      quantityCommitment: '0x' + '33'.repeat(32),
      totalCommitment: '0x' + '34'.repeat(32),
      paymentCommitment: '0x' + '35'.repeat(32),
      contextHash: computeCanonicalContextHash({
        orderId,
        memoHash: '0x' + '31'.repeat(32),
        railgunTxRef: '0x' + '32'.repeat(32),
        productId: '88',
        chainId: '11155111',
        escrowAddr: productAddress,
        unitPriceHash: '0x' + '21'.repeat(32),
      }),
      phase: 1,
      exists: true,
    },
  });

  assert.equal(reconcileResponse.status, 200);
  const reconcilePayload = await reconcileResponse.json();
  assert.equal(reconcilePayload.recoveredFromChain, true);
  assert.equal(reconcilePayload.order.productId, '88');
  assert.equal(reconcilePayload.order.status, 'payment_recorded');
  assert.equal(reconcilePayload.attestationPresent, false);
});

test('indexer health route reports backend sync status', async () => {
  const response = await getJson('/indexer/health');
  assert.equal(response.status, 200);

  const payload = await response.json();
  assert.equal(typeof payload.enabled, 'boolean');
  assert.equal(typeof payload.running, 'boolean');
  assert.equal(typeof payload.started, 'boolean');
  assert.equal(typeof payload.pollIntervalMs, 'number');
  assert.equal(typeof payload.batchSize, 'number');
  assert.equal(typeof payload.trackedProducts, 'number');
  assert.equal(typeof payload.ordersMissingAttestation, 'number');
  assert.equal(typeof payload.trackedProductsMissingMetadata, 'number');
  assert.equal(typeof payload.trackedProductsIncompatible, 'number');
});

test('order routes reject unknown keys and invalid statuses', async () => {
  const response = await postJson('/orders', {
    orderId: '0x' + 'aa'.repeat(32),
    productAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678',
    productId: '42',
    chainId: '11155111',
    sellerAddress: '0x1111111111111111111111111111111111111111',
    status: 'not_a_real_status',
    unitPriceWei: '250000000000000000',
    unitPriceHash: '0x' + 'dd'.repeat(32),
    unexpectedField: true,
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /not allowed/i);
});

test('recovery bundle rejects malformed attestation shape', async () => {
  const orderId = '0x' + 'bc'.repeat(32);
  const response = await postJson('/orders/recovery-bundle', {
    order: {
      orderId,
      productAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      productId: '77',
      escrowAddress: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      chainId: '11155111',
      sellerAddress: '0x1111111111111111111111111111111111111111',
      buyerAddress: '0x2222222222222222222222222222222222222222',
      status: 'payment_pending_recording',
      memoHash: '0x' + '10'.repeat(32),
      railgunTxRef: '0x' + '11'.repeat(32),
      unitPriceWei: '250000000000000000',
      unitPriceHash: '0x' + '12'.repeat(32),
      quantityCommitment: '0x' + '13'.repeat(32),
      totalCommitment: '0x' + '14'.repeat(32),
      paymentCommitment: '0x' + '15'.repeat(32),
      context: {
        orderId,
        memoHash: '0x' + '10'.repeat(32),
        railgunTxRef: '0x' + '11'.repeat(32),
        productId: '77',
        chainId: '11155111',
        escrowAddr: '0x1234567890ABCDEF1234567890ABCDEF12345678',
        unitPriceHash: '0x' + '12'.repeat(32),
      },
    },
    attestation: {
      disclosurePubkey: 'pubkey-1',
      quantityTotalProof: 'bad-proof-type',
    },
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /quantityTotalProof must be an object/i);
});

test('verify-vc rejects malformed request body before verification', async () => {
  const response = await postJson('/verify-vc', {
    vc: 'not-an-object',
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /vc must be an object/i);
});

test('vc archive route stores canonical VC data and fetch-vc can read it without IPFS', async () => {
  const cid = 'QmArchiveTestCid123456789012345678901234567890123456';
  const vc = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', 'OrderCommitmentCredential'],
    credentialSubject: {
      productContract: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      order: {
        orderId: '0x' + 'de'.repeat(32),
      },
      listing: {
        unitPriceWei: '10000000000',
      },
    },
  };

  const archiveResponse = await postJson('/vc-archive', {
    cid,
    vc,
    source: 'test',
  });

  assert.equal(archiveResponse.status, 201);
  const archivePayload = await archiveResponse.json();
  assert.equal(archivePayload.archive.cid, cid);
  assert.equal(
    archivePayload.archive.productAddress,
    '0x1234567890abcdef1234567890abcdef12345678'
  );
  assert.equal(archivePayload.archive.orderId, '0x' + 'de'.repeat(32));
  assert.equal(archivePayload.archive.source, 'test');

  const fetchResponse = await postJson('/fetch-vc', { cid });
  assert.equal(fetchResponse.status, 200);
  const fetchPayload = await fetchResponse.json();
  assert.deepEqual(fetchPayload.vc, vc);
});

test('vc status route reports active status from archive and supports token-gated updates', async () => {
  const cid = 'QmStatusTestCid1234567890123456789012345678901234567';
  const vc = {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential'],
    credentialSubject: {
      productContract: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      order: {
        orderId: '0x' + 'fa'.repeat(32),
      },
    },
  };

  const archiveResponse = await postJson('/vc-archive', { cid, vc, source: 'test' });
  assert.equal(archiveResponse.status, 201);

  const initialStatusResponse = await getJson(`/vc-status/${cid}`);
  assert.equal(initialStatusResponse.status, 200);
  const initialStatusPayload = await initialStatusResponse.json();
  assert.equal(initialStatusPayload.registered, true);
  assert.equal(initialStatusPayload.status, 'active');
  assert.equal(initialStatusPayload.verified, true);

  const unauthorizedPatch = await fetch(`${baseUrl}/vc-status/${cid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'revoked', reason: 'test revoke' }),
  });
  assert.equal(unauthorizedPatch.status, 401);

  const authorizedPatch = await fetch(`${baseUrl}/vc-status/${cid}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-vc-status-token': 'test-status-token',
    },
    body: JSON.stringify({ status: 'revoked', reason: 'test revoke' }),
  });
  assert.equal(authorizedPatch.status, 200);
  const authorizedPatchPayload = await authorizedPatch.json();
  assert.equal(authorizedPatchPayload.status.status, 'revoked');
  assert.equal(authorizedPatchPayload.status.verified, false);
  assert.equal(authorizedPatchPayload.status.reason, 'test revoke');
});
