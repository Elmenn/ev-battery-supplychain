const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const stableStringify = require('json-stable-stringify');
const { AbiCoder, getAddress, isAddress, keccak256, toUtf8Bytes } = require('ethers');

const localEnvPath = path.resolve(__dirname, '.env');
const frontendEnvPath = path.resolve(__dirname, '../../frontend/.env');

if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
if (fs.existsSync(frontendEnvPath)) {
  dotenv.config({ path: frontendEnvPath, override: false });
}

const { verifyVC } = require('./verifyVC');
const { fetchVC } = require('./fetchVC');
const { verifyVCChain } = require('./verifyVCChain');
const { startIndexer, stopIndexer, getIndexerStatus } = require('./indexer');
const {
  RequestValidationError,
  validateVerifyVcBody,
  validateVerifyVcChainBody,
  validateFetchVcBody,
  validateMetadataBody,
  validateMetadataVcCidBody,
  validateBuyerSecretsBody,
  validateBuyerEncryptedOpeningBody,
  validateBuyerEqualityProofBody,
  validateOrderBody,
  validateRecoveryBundleBody,
  validateReconcileBody,
  validateOrderStatusBody,
  validateOrderVcBody,
  validateOrderAttestationBody,
  validateProofBundlePatchBody,
  validateVcArchiveBody,
  validateVcStatusPatchBody,
} = require('./requestSchemas');
const db = require('./db');

const app = express();
const port = Number(process.env.PORT || 5000);
const abiCoder = AbiCoder.defaultAbiCoder();

const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PATCH'],
  credentials: false,
};

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function stringifyMaybeJson(value) {
  if (value == null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function canonicalizeJson(value) {
  return stableStringify(value);
}

function buildVcArchiveParams(cid, vc, source = 'api') {
  const normalizedCid = normalizeString(cid, 'cid', { required: true }).replace(/^ipfs:\/\//, '').trim();
  const canonicalJson = canonicalizeJson(vc);
  const credentialSubject = vc?.credentialSubject || {};

  return {
    cid: normalizedCid,
    vcJson: JSON.stringify(vc),
    canonicalJson,
    vcPayloadHash: keccak256(toUtf8Bytes(canonicalJson)).toLowerCase(),
    productAddress: normalizeAddress(
      credentialSubject.productContract || credentialSubject.listing?.productContract,
      'vc.credentialSubject.productContract'
    ),
    orderId: normalizeString(credentialSubject.order?.orderId, 'vc.credentialSubject.order.orderId'),
    source: normalizeString(source, 'source') || 'api',
  };
}

function buildVcStatusParams(archiveParams, overrides = {}) {
  const currentStatus = normalizeString(overrides.status, 'status') || 'active';
  const revokedAt =
    currentStatus === 'revoked'
      ? normalizeString(overrides.revokedAt, 'revokedAt') || new Date().toISOString()
      : null;

  return {
    cid: archiveParams.cid,
    vcPayloadHash: archiveParams.vcPayloadHash,
    productAddress: archiveParams.productAddress,
    orderId: archiveParams.orderId,
    currentStatus,
    reason: normalizeString(overrides.reason, 'reason'),
    revokedAt,
  };
}

function mapVcStatusRow(row) {
  if (!row) {
    return {
      registered: false,
      status: 'unknown',
      verified: null,
      reason: null,
      revokedAt: null,
      vcPayloadHash: null,
      productAddress: null,
      orderId: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    registered: true,
    status: row.current_status,
    verified: row.current_status === 'active',
    reason: row.reason,
    revokedAt: row.revoked_at,
    vcPayloadHash: row.vc_payload_hash,
    productAddress: row.product_address,
    orderId: row.order_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertVcStatusAdmin(req) {
  const configuredToken = process.env.VC_STATUS_ADMIN_TOKEN;
  if (!configuredToken) {
    const error = new Error('VC status admin token is not configured on the backend');
    error.httpStatus = 503;
    throw error;
  }

  const providedToken = req.get('x-vc-status-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!providedToken || providedToken !== configuredToken) {
    const error = new Error('Unauthorized VC status update');
    error.httpStatus = 401;
    throw error;
  }
}

function handleValidationError(res, error, fallbackMessage) {
  if (error instanceof RequestValidationError) {
    return res.status(400).json({ error: error.message });
  }
  return res.status(400).json({ error: error.message || fallbackMessage });
}

function normalizeAddress(value, fieldName, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }
    return null;
  }

  const candidate =
    typeof value === 'string' && /^0x/i.test(value)
      ? `0x${value.slice(2)}`
      : value;

  if (!isAddress(candidate)) {
    throw new Error(`${fieldName} must be a valid address`);
  }

  return getAddress(candidate).toLowerCase();
}

function normalizeBytes32(value, fieldName, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }
    return null;
  }

  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/i.test(value)) {
    throw new Error(`${fieldName} must be a 32-byte hex string`);
  }

  return `0x${value.slice(2).toLowerCase()}`;
}

function normalizeString(value, fieldName, { required = false } = {}) {
  if (value == null || value === '') {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }
    return null;
  }

  return String(value);
}

function computeCanonicalContextHash(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('context is required to compute contextHash');
  }

  const orderId = normalizeBytes32(context.orderId, 'context.orderId', { required: true });
  const memoHash = normalizeBytes32(context.memoHash, 'context.memoHash', { required: true });
  const railgunTxRef = normalizeBytes32(context.railgunTxRef, 'context.railgunTxRef', { required: true });
  const unitPriceHash = normalizeBytes32(context.unitPriceHash, 'context.unitPriceHash', { required: true });
  const escrowAddr = normalizeAddress(context.escrowAddr, 'context.escrowAddr', { required: true });
  const productId = normalizeString(context.productId, 'context.productId', { required: true });
  const chainId = normalizeString(context.chainId, 'context.chainId', { required: true });

  return keccak256(
    abiCoder.encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'uint256', 'address', 'bytes32'],
      [orderId, memoHash, railgunTxRef, productId, chainId, escrowAddr, unitPriceHash]
    )
  ).toLowerCase();
}

function resolveContextHash({ contextHash, context }) {
  const provided = normalizeBytes32(contextHash, 'contextHash');

  if (!context) {
    return provided;
  }

  const computed = computeCanonicalContextHash(context);
  if (provided && provided !== computed) {
    throw new Error('contextHash does not match canonical context encoding');
  }

  return computed;
}

function mapMetadataRow(row) {
  if (!row) return null;

  return {
    productAddress: row.product_address,
    productMeta: row.product_meta ? JSON.parse(row.product_meta) : null,
    priceWei: row.price_wei,
    priceCommitment: row.price_commitment,
    sellerRailgunAddress: row.seller_railgun_address,
    vcCid: row.vc_cid,
    unitPriceWei: row.unit_price_wei,
    unitPriceHash: row.unit_price_hash,
    listingSnapshotCid: row.listing_snapshot_cid,
    listingSnapshotJson: parseMaybeJson(row.listing_snapshot_json),
    listingSnapshotSig: row.listing_snapshot_sig,
    schemaVersion: row.schema_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBuyerSecretRow(row) {
  if (!row) return null;

  return {
    productAddress: row.product_address,
    buyerAddress: row.buyer_address,
    encryptedBlob: row.encrypted_blob,
    disclosurePubkey: row.disclosure_pubkey,
    cPay: row.c_pay,
    cPayProof: row.c_pay_proof,
    encryptedOpening: row.encrypted_opening,
    equalityProof: row.equality_proof,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderRow(row) {
  if (!row) return null;

  return {
    orderId: row.order_id,
    productAddress: row.product_address,
    productId: row.product_id,
    escrowAddress: row.escrow_address,
    chainId: row.chain_id,
    sellerAddress: row.seller_address,
    buyerAddress: row.buyer_address,
    status: row.status,
    memoHash: row.memo_hash,
    railgunTxRef: row.railgun_tx_ref,
    unitPriceWei: row.unit_price_wei,
    unitPriceHash: row.unit_price_hash,
    quantityCommitment: row.quantity_commitment,
    quantityProof: parseMaybeJson(row.quantity_proof),
    totalCommitment: row.total_commitment,
    totalProof: parseMaybeJson(row.total_proof),
    paymentCommitment: row.payment_commitment,
    paymentProof: parseMaybeJson(row.payment_proof),
    contextHash: row.context_hash,
    orderVcCid: row.order_vc_cid,
    orderVcHash: row.order_vc_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderAttestationRow(row) {
  if (!row) return null;

  return {
    orderId: row.order_id,
    productAddress: row.product_address,
    buyerAddress: row.buyer_address,
    encryptedBlob: row.encrypted_blob,
    disclosurePubkey: row.disclosure_pubkey,
    encryptedQuantityOpening: parseMaybeJson(row.encrypted_quantity_opening),
    encryptedTotalOpening: parseMaybeJson(row.encrypted_total_opening),
    quantityTotalProof: parseMaybeJson(row.quantity_total_proof_json),
    paymentEqualityProof: parseMaybeJson(row.payment_equality_proof_json),
    proofBundle: parseMaybeJson(row.proof_bundle_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOnChainOrderPhaseToStatus(orderPhase, fallbackStatus = 'payment_recorded') {
  const phase = Number(orderPhase);
  if (phase === 1) return 'payment_recorded';
  if (phase === 2) return 'order_confirmed';
  if (phase === 3) return 'bound';
  if (phase === 4) return 'delivered';
  if (phase === 5) return 'expired';
  return fallbackStatus;
}

function mapExistingOrderForRecovery(row) {
  return row ? mapOrderRow(row) : null;
}

function normalizeOnChainOrderSnapshot(order, fieldName = 'onChainOrder') {
  if (!order || typeof order !== 'object') {
    throw new Error(`${fieldName} is required`);
  }

  return {
    buyerAddress: normalizeAddress(order.buyerAddress ?? order.buyer, `${fieldName}.buyerAddress`),
    memoHash: normalizeBytes32(order.memoHash, `${fieldName}.memoHash`, { required: true }),
    railgunTxRef: normalizeBytes32(order.railgunTxRef, `${fieldName}.railgunTxRef`, { required: true }),
    quantityCommitment: normalizeBytes32(order.quantityCommitment, `${fieldName}.quantityCommitment`, { required: true }),
    totalCommitment: normalizeBytes32(order.totalCommitment, `${fieldName}.totalCommitment`, { required: true }),
    paymentCommitment: normalizeBytes32(order.paymentCommitment, `${fieldName}.paymentCommitment`, { required: true }),
    contextHash: normalizeBytes32(order.contextHash, `${fieldName}.contextHash`, { required: true }),
    vcHash: normalizeBytes32(order.vcHash, `${fieldName}.vcHash`),
    purchaseTimestamp: order.purchaseTimestamp == null ? null : Number(order.purchaseTimestamp),
    orderConfirmedTimestamp: order.orderConfirmedTimestamp == null ? null : Number(order.orderConfirmedTimestamp),
    phase: order.phase == null ? null : Number(order.phase),
    exists: order.exists == null ? true : Boolean(order.exists),
  };
}

// Prepared statements created once at startup for performance
const stmtUpsertMetadata = db.prepare(`
  INSERT INTO product_metadata (
    product_address,
    product_meta,
    price_wei,
    price_commitment,
    seller_railgun_address,
    unit_price_wei,
    unit_price_hash,
    listing_snapshot_cid,
    listing_snapshot_json,
    listing_snapshot_sig,
    schema_version,
    updated_at
  ) VALUES (
    @productAddress,
    @productMeta,
    @priceWei,
    @priceCommitment,
    @sellerRailgunAddress,
    @unitPriceWei,
    @unitPriceHash,
    @listingSnapshotCid,
    @listingSnapshotJson,
    @listingSnapshotSig,
    @schemaVersion,
    datetime('now')
  )
  ON CONFLICT(product_address) DO UPDATE SET
    product_meta = excluded.product_meta,
    price_wei = excluded.price_wei,
    price_commitment = excluded.price_commitment,
    seller_railgun_address = excluded.seller_railgun_address,
    unit_price_wei = excluded.unit_price_wei,
    unit_price_hash = excluded.unit_price_hash,
    listing_snapshot_cid = excluded.listing_snapshot_cid,
    listing_snapshot_json = excluded.listing_snapshot_json,
    listing_snapshot_sig = excluded.listing_snapshot_sig,
    schema_version = excluded.schema_version,
    updated_at = datetime('now')
`);

const stmtGetMetadata = db.prepare('SELECT * FROM product_metadata WHERE product_address = ?');

const stmtUpdateVcCid = db.prepare(
  "UPDATE product_metadata SET vc_cid = ?, updated_at = datetime('now') WHERE product_address = ?"
);

const stmtUpsertBuyerSecret = db.prepare(`
  INSERT OR REPLACE INTO buyer_secrets
    (product_address, buyer_address, encrypted_blob, disclosure_pubkey, c_pay, c_pay_proof, updated_at)
  VALUES
    (@productAddress, @buyerAddress, @encryptedBlob, @disclosurePubkey, @cPay, @cPayProof, datetime('now'))
`);

const stmtGetBuyerSecret = db.prepare(
  'SELECT * FROM buyer_secrets WHERE product_address = ? AND buyer_address = ?'
);

const stmtUpdateEncryptedOpening = db.prepare(
  "UPDATE buyer_secrets SET encrypted_opening = ?, updated_at = datetime('now') WHERE product_address = ? AND buyer_address = ?"
);

const stmtUpdateEqualityProof = db.prepare(
  "UPDATE buyer_secrets SET equality_proof = ?, updated_at = datetime('now') WHERE product_address = ? AND buyer_address = ?"
);

const stmtUpsertOrder = db.prepare(`
  INSERT INTO product_orders (
    order_id,
    product_address,
    product_id,
    escrow_address,
    chain_id,
    seller_address,
    buyer_address,
    status,
    memo_hash,
    railgun_tx_ref,
    unit_price_wei,
    unit_price_hash,
    quantity_commitment,
    quantity_proof,
    total_commitment,
    total_proof,
    payment_commitment,
    payment_proof,
    context_hash,
    order_vc_cid,
    order_vc_hash,
    updated_at
  ) VALUES (
    @orderId,
    @productAddress,
    @productId,
    @escrowAddress,
    @chainId,
    @sellerAddress,
    @buyerAddress,
    @status,
    @memoHash,
    @railgunTxRef,
    @unitPriceWei,
    @unitPriceHash,
    @quantityCommitment,
    @quantityProof,
    @totalCommitment,
    @totalProof,
    @paymentCommitment,
    @paymentProof,
    @contextHash,
    @orderVcCid,
    @orderVcHash,
    datetime('now')
  )
  ON CONFLICT(order_id) DO UPDATE SET
    product_address = excluded.product_address,
    product_id = excluded.product_id,
    escrow_address = excluded.escrow_address,
    chain_id = excluded.chain_id,
    seller_address = excluded.seller_address,
    buyer_address = excluded.buyer_address,
    status = excluded.status,
    memo_hash = excluded.memo_hash,
    railgun_tx_ref = excluded.railgun_tx_ref,
    unit_price_wei = excluded.unit_price_wei,
    unit_price_hash = excluded.unit_price_hash,
    quantity_commitment = excluded.quantity_commitment,
    quantity_proof = excluded.quantity_proof,
    total_commitment = excluded.total_commitment,
    total_proof = excluded.total_proof,
    payment_commitment = excluded.payment_commitment,
    payment_proof = excluded.payment_proof,
    context_hash = excluded.context_hash,
    order_vc_cid = excluded.order_vc_cid,
    order_vc_hash = excluded.order_vc_hash,
    updated_at = datetime('now')
`);

const stmtGetOrder = db.prepare('SELECT * FROM product_orders WHERE order_id = ?');
const stmtGetLatestOrderForProductBuyer = db.prepare(`
  SELECT *
  FROM product_orders
  WHERE product_address = ? AND buyer_address = ?
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1
`);
const stmtUpdateOrderStatus = db.prepare(
  "UPDATE product_orders SET status = ?, updated_at = datetime('now') WHERE order_id = ?"
);
const stmtUpdateOrderVc = db.prepare(
  "UPDATE product_orders SET order_vc_cid = ?, order_vc_hash = ?, updated_at = datetime('now') WHERE order_id = ?"
);

const stmtUpsertOrderAttestation = db.prepare(`
  INSERT INTO order_private_attestations (
    order_id,
    product_address,
    buyer_address,
    encrypted_blob,
    disclosure_pubkey,
    encrypted_quantity_opening,
    encrypted_total_opening,
    quantity_total_proof_json,
    payment_equality_proof_json,
    proof_bundle_json,
    updated_at
  ) VALUES (
    @orderId,
    @productAddress,
    @buyerAddress,
    @encryptedBlob,
    @disclosurePubkey,
    @encryptedQuantityOpening,
    @encryptedTotalOpening,
    @quantityTotalProof,
    @paymentEqualityProof,
    @proofBundle,
    datetime('now')
  )
  ON CONFLICT(order_id) DO UPDATE SET
    product_address = excluded.product_address,
    buyer_address = excluded.buyer_address,
    encrypted_blob = excluded.encrypted_blob,
    disclosure_pubkey = excluded.disclosure_pubkey,
    encrypted_quantity_opening = excluded.encrypted_quantity_opening,
    encrypted_total_opening = excluded.encrypted_total_opening,
    quantity_total_proof_json = excluded.quantity_total_proof_json,
    payment_equality_proof_json = excluded.payment_equality_proof_json,
    proof_bundle_json = excluded.proof_bundle_json,
    updated_at = datetime('now')
`);

const stmtGetOrderAttestation = db.prepare(
  'SELECT * FROM order_private_attestations WHERE order_id = ?'
);

const stmtUpdateOrderAttestationProofBundle = db.prepare(`
  UPDATE order_private_attestations
  SET
    encrypted_quantity_opening = @encryptedQuantityOpening,
    encrypted_total_opening = @encryptedTotalOpening,
    quantity_total_proof_json = @quantityTotalProof,
    payment_equality_proof_json = @paymentEqualityProof,
    proof_bundle_json = @proofBundle,
    updated_at = datetime('now')
  WHERE order_id = @orderId
`);

const stmtUpsertVcArchive = db.prepare(`
  INSERT INTO vc_archives (
    cid,
    vc_json,
    canonical_json,
    vc_payload_hash,
    product_address,
    order_id,
    source,
    updated_at
  ) VALUES (
    @cid,
    @vcJson,
    @canonicalJson,
    @vcPayloadHash,
    @productAddress,
    @orderId,
    @source,
    datetime('now')
  )
  ON CONFLICT(cid) DO UPDATE SET
    vc_json = excluded.vc_json,
    canonical_json = excluded.canonical_json,
    vc_payload_hash = excluded.vc_payload_hash,
    product_address = COALESCE(excluded.product_address, vc_archives.product_address),
    order_id = COALESCE(excluded.order_id, vc_archives.order_id),
    source = COALESCE(excluded.source, vc_archives.source),
    updated_at = datetime('now')
`);

const stmtGetVcArchive = db.prepare(`
  SELECT cid, vc_json, canonical_json, vc_payload_hash, product_address, order_id, source, created_at, updated_at
  FROM vc_archives
  WHERE cid = ?
`);
const stmtGetVcStatus = db.prepare(`
  SELECT cid, vc_payload_hash, product_address, order_id, current_status, reason, revoked_at, created_at, updated_at
  FROM vc_status
  WHERE cid = ?
`);
const stmtInsertVcStatusIfMissing = db.prepare(`
  INSERT OR IGNORE INTO vc_status (
    cid,
    vc_payload_hash,
    product_address,
    order_id,
    current_status,
    reason,
    revoked_at,
    updated_at
  ) VALUES (
    @cid,
    @vcPayloadHash,
    @productAddress,
    @orderId,
    @currentStatus,
    @reason,
    @revokedAt,
    datetime('now')
  )
`);
const stmtUpdateVcStatus = db.prepare(`
  UPDATE vc_status
  SET
    vc_payload_hash = COALESCE(@vcPayloadHash, vc_payload_hash),
    product_address = COALESCE(@productAddress, product_address),
    order_id = COALESCE(@orderId, order_id),
    current_status = @currentStatus,
    reason = @reason,
    revoked_at = @revokedAt,
    updated_at = datetime('now')
  WHERE cid = @cid
`);

const txUpsertOrderRecoveryBundle = db.transaction((orderParams, attestationParams) => {
  stmtUpsertOrder.run(orderParams);
  stmtUpsertOrderAttestation.run(attestationParams);
});

app.use(cors(corsOptions));
app.use(express.json());

app.post('/verify-vc', async (req, res) => {
  try {
    validateVerifyVcBody(req.body || {});
    const { vc, contractAddress } = req.body;
    const verificationResult = await verifyVC(vc, contractAddress || null);
    const issuerOk = verificationResult?.issuer?.signature_verified === true;
    const holderOk =
      verificationResult?.holder == null ||
      verificationResult?.holder?.skipped === true ||
      verificationResult?.holder?.signature_verified === true;

    return res.json({
      success: issuerOk && holderOk,
      message: 'VC verification complete.',
      issuer: verificationResult.issuer,
      holder: verificationResult.holder,
    });
  } catch (error) {
    console.error('Error verifying VC:', error);
    if (error instanceof RequestValidationError) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/fetch-vc', async (req, res) => {
  try {
    validateFetchVcBody(req.body || {});
    const { cid } = req.body;
    const vcJsonData = await fetchVC(cid);
    const archiveParams = buildVcArchiveParams(cid, vcJsonData, 'fetch-cache');
    stmtUpsertVcArchive.run(archiveParams);
    stmtInsertVcStatusIfMissing.run(buildVcStatusParams(archiveParams));
    return res.json({
      message: 'VC fetching complete.',
      vc: vcJsonData,
    });
  } catch (error) {
    console.error('Error fetching VC:', error);
    if (error instanceof RequestValidationError) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/verify-vc-chain', async (req, res) => {
  try {
    validateVerifyVcChainBody(req.body || {});
    const { cid, maxDepth } = req.body;
    const result = await verifyVCChain(cid, fetchVC, { maxDepth });
    return res.json(result);
  } catch (error) {
    console.error('Error verifying VC chain:', error);
    if (error instanceof RequestValidationError) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/vc-archive', (req, res) => {
  try {
    validateVcArchiveBody(req.body || {});
    const { cid, vc, source } = req.body;
    const params = buildVcArchiveParams(cid, vc, source || 'api');
    stmtUpsertVcArchive.run(params);
    stmtInsertVcStatusIfMissing.run(buildVcStatusParams(params));
    const row = stmtGetVcArchive.get(params.cid);
    return res.status(201).json({
      success: true,
      archive: {
        cid: row.cid,
        vcPayloadHash: row.vc_payload_hash,
        productAddress: row.product_address,
        orderId: row.order_id,
        source: row.source,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Error archiving VC:', error);
    return handleValidationError(res, error, 'Invalid VC archive payload');
  }
});

app.get('/vc-status/:cid', (req, res) => {
  try {
    const cid = normalizeString(req.params.cid, 'cid', { required: true }).replace(/^ipfs:\/\//, '').trim();
    return res.json(mapVcStatusRow(stmtGetVcStatus.get(cid)));
  } catch (error) {
    console.error('Error fetching VC status:', error);
    return res.status(400).json({ error: error.message || 'Invalid VC status lookup' });
  }
});

app.patch('/vc-status/:cid', (req, res) => {
  try {
    assertVcStatusAdmin(req);
    validateVcStatusPatchBody(req.body || {});
    const cid = normalizeString(req.params.cid, 'cid', { required: true }).replace(/^ipfs:\/\//, '').trim();
    const existingArchive = stmtGetVcArchive.get(cid);
    const existingStatus = stmtGetVcStatus.get(cid);
    const archiveParams = existingArchive
      ? {
          cid: existingArchive.cid,
          vcPayloadHash: existingArchive.vc_payload_hash,
          productAddress: existingArchive.product_address,
          orderId: existingArchive.order_id,
        }
      : {
          cid,
          vcPayloadHash: null,
          productAddress: null,
          orderId: null,
        };

    const params = buildVcStatusParams(archiveParams, {
      status: req.body.status,
      reason: req.body.reason,
      revokedAt: req.body.revokedAt,
    });

    if (!existingStatus) {
      stmtInsertVcStatusIfMissing.run(params);
    }
    stmtUpdateVcStatus.run(params);
    return res.json({ success: true, status: mapVcStatusRow(stmtGetVcStatus.get(cid)) });
  } catch (error) {
    console.error('Error updating VC status:', error);
    const statusCode = error.httpStatus || 400;
    return res.status(statusCode).json({ error: error.message || 'Invalid VC status update' });
  }
});

app.post('/metadata', (req, res) => {
  try {
    validateMetadataBody(req.body || {});
    const {
      productAddress,
      productMeta,
      priceWei,
      priceCommitment,
      sellerRailgunAddress,
      unitPriceWei,
      unitPriceHash,
      listingSnapshotCid,
      listingSnapshotJson,
      listingSnapshotSig,
      schemaVersion,
    } = req.body;
    const addr = normalizeAddress(productAddress, 'productAddress', { required: true });
    stmtUpsertMetadata.run({
      productAddress: addr,
      productMeta: JSON.stringify(productMeta),
      priceWei: priceWei || null,
      priceCommitment: priceCommitment || null,
      sellerRailgunAddress: sellerRailgunAddress ? normalizeString(sellerRailgunAddress, 'sellerRailgunAddress') : null,
      unitPriceWei: unitPriceWei || null,
      unitPriceHash: unitPriceHash ? normalizeBytes32(unitPriceHash, 'unitPriceHash') : null,
      listingSnapshotCid: listingSnapshotCid || null,
      listingSnapshotJson: stringifyMaybeJson(listingSnapshotJson),
      listingSnapshotSig: listingSnapshotSig || null,
      schemaVersion: schemaVersion || null,
    });
    return res.status(201).json({ success: true, productAddress: addr });
  } catch (error) {
    console.error('Error saving product metadata:', error);
    return handleValidationError(res, error, 'Invalid metadata payload');
  }
});

app.get('/metadata/:address', (req, res) => {
  try {
    const addr = normalizeAddress(req.params.address, 'address', { required: true });
    const row = stmtGetMetadata.get(addr);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(mapMetadataRow(row));
  } catch (error) {
    console.error('Error fetching product metadata:', error);
    return res.status(400).json({ error: error.message || 'Invalid address' });
  }
});

app.patch('/metadata/:address/vc-cid', (req, res) => {
  try {
    validateMetadataVcCidBody(req.body || {});
    const addr = normalizeAddress(req.params.address, 'address', { required: true });
    const { vcCid } = req.body;
    const result = stmtUpdateVcCid.run(vcCid, addr);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating vcCid:', error);
    return handleValidationError(res, error, 'Invalid request');
  }
});

app.post('/buyer-secrets', (req, res) => {
  try {
    validateBuyerSecretsBody(req.body || {});
    const { productAddress, buyerAddress, encryptedBlob, disclosurePubkey, cPay, cPayProof } = req.body;
    stmtUpsertBuyerSecret.run({
      productAddress: normalizeAddress(productAddress, 'productAddress', { required: true }),
      buyerAddress: normalizeAddress(buyerAddress, 'buyerAddress', { required: true }),
      encryptedBlob: stringifyMaybeJson(encryptedBlob),
      disclosurePubkey: disclosurePubkey,
      cPay: cPay || null,
      cPayProof: cPayProof || null,
    });
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Error saving buyer secret:', error);
    return handleValidationError(res, error, 'Invalid buyer secret payload');
  }
});

app.get('/buyer-secrets/:productAddress/:buyerAddress', (req, res) => {
  try {
    const pa = normalizeAddress(req.params.productAddress, 'productAddress', { required: true });
    const ba = normalizeAddress(req.params.buyerAddress, 'buyerAddress', { required: true });
    const row = stmtGetBuyerSecret.get(pa, ba);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(mapBuyerSecretRow(row));
  } catch (error) {
    console.error('Error fetching buyer secret:', error);
    return res.status(400).json({ error: error.message || 'Invalid address' });
  }
});

app.patch('/buyer-secrets/:productAddress/:buyerAddress/encrypted-opening', (req, res) => {
  try {
    validateBuyerEncryptedOpeningBody(req.body || {});
    const pa = normalizeAddress(req.params.productAddress, 'productAddress', { required: true });
    const ba = normalizeAddress(req.params.buyerAddress, 'buyerAddress', { required: true });
    const { encryptedOpening } = req.body;
    const result = stmtUpdateEncryptedOpening.run(stringifyMaybeJson(encryptedOpening), pa, ba);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating encrypted opening:', error);
    return handleValidationError(res, error, 'Invalid request');
  }
});

app.patch('/buyer-secrets/:productAddress/:buyerAddress/equality-proof', (req, res) => {
  try {
    validateBuyerEqualityProofBody(req.body || {});
    const pa = normalizeAddress(req.params.productAddress, 'productAddress', { required: true });
    const ba = normalizeAddress(req.params.buyerAddress, 'buyerAddress', { required: true });
    const { equalityProof } = req.body;
    const result = stmtUpdateEqualityProof.run(stringifyMaybeJson(equalityProof), pa, ba);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true });
  } catch (error) {
    console.error('Error updating equality proof:', error);
    return handleValidationError(res, error, 'Invalid request');
  }
});

app.post('/orders', (req, res) => {
  try {
    validateOrderBody(req.body || {});
    const {
      orderId,
      productAddress,
      productId,
      escrowAddress,
      chainId,
      sellerAddress,
      buyerAddress,
      status,
      memoHash,
      railgunTxRef,
      unitPriceWei,
      unitPriceHash,
      quantityCommitment,
      quantityProof,
      totalCommitment,
      totalProof,
      paymentCommitment,
      paymentProof,
      contextHash,
      context,
      orderVcCid,
      orderVcHash,
    } = req.body;
    const normalizedOrderId = normalizeBytes32(orderId, 'orderId', { required: true });

    const resolvedContextHash = resolveContextHash({ contextHash, context });
    if (!resolvedContextHash) {
      return res.status(400).json({ error: 'contextHash or canonical context is required' });
    }

    stmtUpsertOrder.run({
      orderId: normalizedOrderId,
      productAddress: normalizeAddress(productAddress, 'productAddress', { required: true }),
      productId: normalizeString(productId, 'productId', { required: true }),
      escrowAddress: normalizeAddress(escrowAddress || productAddress, 'escrowAddress', { required: true }),
      chainId: normalizeString(chainId, 'chainId', { required: true }),
      sellerAddress: normalizeAddress(sellerAddress, 'sellerAddress', { required: true }),
      buyerAddress: normalizeAddress(buyerAddress, 'buyerAddress'),
      status: normalizeString(status, 'status', { required: true }),
      memoHash: normalizeBytes32(memoHash, 'memoHash'),
      railgunTxRef: normalizeBytes32(railgunTxRef, 'railgunTxRef'),
      unitPriceWei: normalizeString(unitPriceWei, 'unitPriceWei', { required: true }),
      unitPriceHash: normalizeBytes32(unitPriceHash, 'unitPriceHash', { required: true }),
      quantityCommitment: normalizeBytes32(quantityCommitment, 'quantityCommitment'),
      quantityProof: stringifyMaybeJson(quantityProof),
      totalCommitment: normalizeBytes32(totalCommitment, 'totalCommitment'),
      totalProof: stringifyMaybeJson(totalProof),
      paymentCommitment: normalizeBytes32(paymentCommitment, 'paymentCommitment'),
      paymentProof: stringifyMaybeJson(paymentProof),
      contextHash: resolvedContextHash,
      orderVcCid: orderVcCid || null,
      orderVcHash: normalizeBytes32(orderVcHash, 'orderVcHash'),
    });

    const row = stmtGetOrder.get(normalizedOrderId);
    return res.status(201).json({ success: true, order: mapOrderRow(row) });
  } catch (error) {
    console.error('Error saving order:', error);
    return handleValidationError(res, error, 'Invalid order payload');
  }
});

app.post('/orders/recovery-bundle', (req, res) => {
  try {
    validateRecoveryBundleBody(req.body || {});
    const { order, attestation } = req.body || {};
    const normalizedOrderId = normalizeBytes32(order.orderId, 'order.orderId', { required: true });
    const resolvedContextHash = resolveContextHash({ contextHash: order.contextHash, context: order.context });
    if (!resolvedContextHash) {
      return res.status(400).json({ error: 'order.contextHash or order.context is required' });
    }

    const normalizedProductAddress = normalizeAddress(order.productAddress, 'order.productAddress', { required: true });
    const normalizedBuyerAddress = normalizeAddress(order.buyerAddress, 'order.buyerAddress', { required: true });

    txUpsertOrderRecoveryBundle(
      {
        orderId: normalizedOrderId,
        productAddress: normalizedProductAddress,
        productId: normalizeString(order.productId, 'order.productId', { required: true }),
        escrowAddress: normalizeAddress(order.escrowAddress || order.productAddress, 'order.escrowAddress', { required: true }),
        chainId: normalizeString(order.chainId, 'order.chainId', { required: true }),
        sellerAddress: normalizeAddress(order.sellerAddress, 'order.sellerAddress', { required: true }),
        buyerAddress: normalizedBuyerAddress,
        status: normalizeString(order.status, 'order.status', { required: true }),
        memoHash: normalizeBytes32(order.memoHash, 'order.memoHash', { required: true }),
        railgunTxRef: normalizeBytes32(order.railgunTxRef, 'order.railgunTxRef', { required: true }),
        unitPriceWei: normalizeString(order.unitPriceWei, 'order.unitPriceWei', { required: true }),
        unitPriceHash: normalizeBytes32(order.unitPriceHash, 'order.unitPriceHash', { required: true }),
        quantityCommitment: normalizeBytes32(order.quantityCommitment, 'order.quantityCommitment', { required: true }),
        quantityProof: stringifyMaybeJson(order.quantityProof),
        totalCommitment: normalizeBytes32(order.totalCommitment, 'order.totalCommitment', { required: true }),
        totalProof: stringifyMaybeJson(order.totalProof),
        paymentCommitment: normalizeBytes32(order.paymentCommitment, 'order.paymentCommitment', { required: true }),
        paymentProof: stringifyMaybeJson(order.paymentProof),
        contextHash: resolvedContextHash,
        orderVcCid: order.orderVcCid || null,
        orderVcHash: normalizeBytes32(order.orderVcHash, 'order.orderVcHash'),
      },
      {
        orderId: normalizedOrderId,
        productAddress: normalizedProductAddress,
        buyerAddress: normalizedBuyerAddress,
        encryptedBlob: stringifyMaybeJson(attestation.encryptedBlob ?? null),
        disclosurePubkey: normalizeString(attestation.disclosurePubkey, 'attestation.disclosurePubkey', { required: true }),
        encryptedQuantityOpening: stringifyMaybeJson(attestation.encryptedQuantityOpening),
        encryptedTotalOpening: stringifyMaybeJson(attestation.encryptedTotalOpening),
        quantityTotalProof: stringifyMaybeJson(attestation.quantityTotalProof),
        paymentEqualityProof: stringifyMaybeJson(attestation.paymentEqualityProof),
        proofBundle: stringifyMaybeJson(attestation.proofBundle),
      }
    );

    return res.status(201).json({
      success: true,
      order: mapOrderRow(stmtGetOrder.get(normalizedOrderId)),
      attestation: mapOrderAttestationRow(stmtGetOrderAttestation.get(normalizedOrderId)),
    });
  } catch (error) {
    console.error('Error saving order recovery bundle:', error);
    return handleValidationError(res, error, 'Invalid order recovery bundle payload');
  }
});

app.get('/orders/:orderId', (req, res) => {
  try {
    const orderId = normalizeBytes32(req.params.orderId, 'orderId', { required: true });
    const row = stmtGetOrder.get(orderId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(mapOrderRow(row));
  } catch (error) {
    console.error('Error fetching order:', error);
    return res.status(400).json({ error: error.message || 'Invalid orderId' });
  }
});

app.get('/orders/by-product/:productAddress/buyer/:buyerAddress/latest', (req, res) => {
  try {
    const productAddress = normalizeAddress(req.params.productAddress, 'productAddress', { required: true });
    const buyerAddress = normalizeAddress(req.params.buyerAddress, 'buyerAddress', { required: true });
    const row = stmtGetLatestOrderForProductBuyer.get(productAddress, buyerAddress);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(mapOrderRow(row));
  } catch (error) {
    console.error('Error fetching latest order for product/buyer:', error);
    return res.status(400).json({ error: error.message || 'Invalid order lookup' });
  }
});

app.post('/orders/:orderId/reconcile', (req, res) => {
  try {
    validateReconcileBody(req.body || {});
    const orderId = normalizeBytes32(req.params.orderId, 'orderId', { required: true });
    const productAddress = normalizeAddress(req.body.productAddress, 'productAddress', { required: true });
    const existingRow = stmtGetOrder.get(orderId);
    const existingOrder = mapExistingOrderForRecovery(existingRow);
    const metadataRow = stmtGetMetadata.get(productAddress);
    const metadata = mapMetadataRow(metadataRow);
    const listingMeta = metadata?.productMeta || {};
    const onChainOrder = normalizeOnChainOrderSnapshot(req.body.onChainOrder, 'onChainOrder');

    if (!onChainOrder.exists) {
      return res.status(400).json({ error: 'onChainOrder.exists must be true for reconciliation' });
    }

    const productId = normalizeString(
      req.body.productId ?? existingOrder?.productId ?? listingMeta.productId,
      'productId',
      { required: true }
    );
    const chainId = normalizeString(
      req.body.chainId ?? existingOrder?.chainId ?? listingMeta.chainId,
      'chainId',
      { required: true }
    );
    const sellerAddress = normalizeAddress(
      req.body.sellerAddress ?? existingOrder?.sellerAddress ?? listingMeta.sellerAddr,
      'sellerAddress',
      { required: true }
    );
    const unitPriceWei = normalizeString(
      req.body.unitPriceWei ?? existingOrder?.unitPriceWei ?? metadata?.unitPriceWei ?? listingMeta.unitPriceWei,
      'unitPriceWei',
      { required: true }
    );
    const unitPriceHash = normalizeBytes32(
      req.body.unitPriceHash ?? existingOrder?.unitPriceHash ?? metadata?.unitPriceHash ?? listingMeta.unitPriceHash,
      'unitPriceHash',
      { required: true }
    );
    const resolvedContextHash = resolveContextHash({
      contextHash: onChainOrder.contextHash,
      context: {
        orderId,
        memoHash: onChainOrder.memoHash,
        railgunTxRef: onChainOrder.railgunTxRef,
        productId,
        chainId,
        escrowAddr: productAddress,
        unitPriceHash,
      },
    });

    stmtUpsertOrder.run({
      orderId,
      productAddress,
      productId,
      escrowAddress: productAddress,
      chainId,
      sellerAddress,
      buyerAddress: onChainOrder.buyerAddress ?? existingOrder?.buyerAddress ?? null,
      status: mapOnChainOrderPhaseToStatus(onChainOrder.phase, existingOrder?.status),
      memoHash: onChainOrder.memoHash,
      railgunTxRef: onChainOrder.railgunTxRef,
      unitPriceWei,
      unitPriceHash,
      quantityCommitment: onChainOrder.quantityCommitment,
      quantityProof: stringifyMaybeJson(existingOrder?.quantityProof ?? null),
      totalCommitment: onChainOrder.totalCommitment,
      totalProof: stringifyMaybeJson(existingOrder?.totalProof ?? null),
      paymentCommitment: onChainOrder.paymentCommitment,
      paymentProof: stringifyMaybeJson(existingOrder?.paymentProof ?? null),
      contextHash: resolvedContextHash,
      orderVcCid: existingOrder?.orderVcCid || null,
      orderVcHash: onChainOrder.vcHash ?? existingOrder?.orderVcHash ?? null,
    });

    const reconciledOrder = mapOrderRow(stmtGetOrder.get(orderId));
    const attestation = mapOrderAttestationRow(stmtGetOrderAttestation.get(orderId));
    return res.json({
      success: true,
      order: reconciledOrder,
      attestationPresent: Boolean(attestation),
      recoveredFromChain: !existingRow,
    });
  } catch (error) {
    console.error('Error reconciling order:', error);
    return handleValidationError(res, error, 'Invalid reconciliation payload');
  }
});

app.patch('/orders/:orderId/status', (req, res) => {
  try {
    validateOrderStatusBody(req.body || {});
    const orderId = normalizeBytes32(req.params.orderId, 'orderId', { required: true });
    const status = normalizeString(req.body.status, 'status', { required: true });
    const result = stmtUpdateOrderStatus.run(status, orderId);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true, order: mapOrderRow(stmtGetOrder.get(orderId)) });
  } catch (error) {
    console.error('Error updating order status:', error);
    return handleValidationError(res, error, 'Invalid status update');
  }
});

app.patch('/orders/:orderId/vc-cid', (req, res) => {
  try {
    validateOrderVcBody(req.body || {});
    const orderId = normalizeBytes32(req.params.orderId, 'orderId', { required: true });
    const vcCid = normalizeString(req.body.vcCid, 'vcCid', { required: true });
    const vcHash = normalizeBytes32(req.body.vcHash, 'vcHash');
    const result = stmtUpdateOrderVc.run(vcCid, vcHash, orderId);
    if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    return res.json({ success: true, order: mapOrderRow(stmtGetOrder.get(orderId)) });
  } catch (error) {
    console.error('Error updating order VC CID:', error);
    return handleValidationError(res, error, 'Invalid VC patch payload');
  }
});

app.post('/order-attestations', (req, res) => {
  try {
    validateOrderAttestationBody(req.body || {});
    const {
      orderId,
      productAddress,
      buyerAddress,
      encryptedBlob,
      disclosurePubkey,
      encryptedQuantityOpening,
      encryptedTotalOpening,
      quantityTotalProof,
      paymentEqualityProof,
      proofBundle,
    } = req.body;

    stmtUpsertOrderAttestation.run({
      orderId: normalizeBytes32(orderId, 'orderId', { required: true }),
      productAddress: normalizeAddress(productAddress, 'productAddress', { required: true }),
      buyerAddress: normalizeAddress(buyerAddress, 'buyerAddress', { required: true }),
      encryptedBlob: stringifyMaybeJson(encryptedBlob ?? null),
      disclosurePubkey: normalizeString(disclosurePubkey, 'disclosurePubkey', { required: true }),
      encryptedQuantityOpening: stringifyMaybeJson(encryptedQuantityOpening),
      encryptedTotalOpening: stringifyMaybeJson(encryptedTotalOpening),
      quantityTotalProof: stringifyMaybeJson(quantityTotalProof),
      paymentEqualityProof: stringifyMaybeJson(paymentEqualityProof),
      proofBundle: stringifyMaybeJson(proofBundle),
    });

    const row = stmtGetOrderAttestation.get(normalizeBytes32(orderId, 'orderId', { required: true }));
    return res.status(201).json({ success: true, attestation: mapOrderAttestationRow(row) });
  } catch (error) {
    console.error('Error saving order attestation:', error);
    return handleValidationError(res, error, 'Invalid order attestation payload');
  }
});

app.get('/order-attestations/:orderId', (req, res) => {
  try {
    const orderId = normalizeBytes32(req.params.orderId, 'orderId', { required: true });
    const row = stmtGetOrderAttestation.get(orderId);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(mapOrderAttestationRow(row));
  } catch (error) {
    console.error('Error fetching order attestation:', error);
    return res.status(400).json({ error: error.message || 'Invalid orderId' });
  }
});

app.patch('/order-attestations/:orderId/proof-bundle', (req, res) => {
  try {
    validateProofBundlePatchBody(req.body || {});
    const orderId = normalizeBytes32(req.params.orderId, 'orderId', { required: true });
    const existing = stmtGetOrderAttestation.get(orderId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const merged = {
      orderId,
      encryptedQuantityOpening: stringifyMaybeJson(
        req.body.encryptedQuantityOpening ?? parseMaybeJson(existing.encrypted_quantity_opening)
      ),
      encryptedTotalOpening: stringifyMaybeJson(
        req.body.encryptedTotalOpening ?? parseMaybeJson(existing.encrypted_total_opening)
      ),
      quantityTotalProof: stringifyMaybeJson(
        req.body.quantityTotalProof ?? parseMaybeJson(existing.quantity_total_proof_json)
      ),
      paymentEqualityProof: stringifyMaybeJson(
        req.body.paymentEqualityProof ?? parseMaybeJson(existing.payment_equality_proof_json)
      ),
      proofBundle: stringifyMaybeJson(
        req.body.proofBundle ?? parseMaybeJson(existing.proof_bundle_json)
      ),
    };

    stmtUpdateOrderAttestationProofBundle.run(merged);
    return res.json({
      success: true,
      attestation: mapOrderAttestationRow(stmtGetOrderAttestation.get(orderId)),
    });
  } catch (error) {
    console.error('Error updating order proof bundle:', error);
    return handleValidationError(res, error, 'Invalid proof bundle payload');
  }
});

let serverInstance = null;

app.get('/indexer/health', (_req, res) => {
  return res.json(getIndexerStatus());
});

function startServer(listenPort = port) {
  serverInstance = app.listen(listenPort, () => {
    console.log(`Server is running at http://localhost:${listenPort}`);
  });
  serverInstance.once('close', () => {
    stopIndexer();
  });
  void startIndexer().catch((error) => {
    console.error('Error starting backend indexer:', error);
  });
  return serverInstance;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
  computeCanonicalContextHash,
  getIndexerStatus,
};
