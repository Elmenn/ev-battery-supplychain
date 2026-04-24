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
  validateErc7984OrderSnapshotBody,
  validateOrderAttestationBody,
  validateProofBundlePatchBody,
  validateVcArchiveBody,
  validateVcStatusPatchBody,
} = require('./requestSchemas');
const db = require('./db');
const {
  validatePaymentBridgeArtifact,
} = require('./erc7984/paymentBridgeModel');
const {
  validateEqualityAttestationRecord,
  EqualityStatus,
} = require('./erc7984/equalityAttestationModel');

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

function getPinataJwt() {
  return (
    process.env.PINATA_JWT ||
    process.env.REACT_APP_PINATA_JWT ||
    process.env.PINATA_API_JWT ||
    null
  );
}

async function uploadVcToPinataJson(vc) {
  const jwt = getPinataJwt();
  if (!jwt) {
    const error = new Error('Pinata JWT is not configured on the backend');
    error.httpStatus = 500;
    throw error;
  }

  const formattedJson = JSON.stringify(vc, null, 2);
  const form = new FormData();
  form.append(
    'file',
    new Blob([formattedJson], { type: 'application/json' }),
    'vc.json'
  );

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: form,
  });

  if (!response.ok) {
    let message = response.statusText || 'Pinata upload failed';
    try {
      const body = await response.json();
      message = body?.error?.details || body?.message || JSON.stringify(body);
    } catch {
      // keep default message
    }
    const error = new Error(`Pinata upload failed: ${message}`);
    error.httpStatus = response.status >= 400 && response.status < 600 ? response.status : 502;
    throw error;
  }

  const payload = await response.json();
  const cid = String(payload?.IpfsHash || '').trim();
  if (!cid) {
    const error = new Error('Pinata upload succeeded without returning a CID');
    error.httpStatus = 502;
    throw error;
  }

  return cid;
}

function normalizeEqualityAttestationForValidation(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return record;
  }

  return {
    ...record,
    handle: record.handle === '' ? null : record.handle,
    verifiedTxHash: record.verifiedTxHash === '' ? null : record.verifiedTxHash,
  };
}

function normalizeEqualityAttestationSnapshot(record, fieldName, fallbackOrderId = null) {
  if (record == null) return null;

  const normalized = normalizeEqualityAttestationForValidation({
    ...record,
    orderId: record.orderId ?? fallbackOrderId ?? null,
  });
  validateEqualityAttestationRecord(normalized, fieldName);
  return {
    orderId: normalizeBytes32(normalized.orderId, `${fieldName}.orderId`, { required: true }),
    target: normalizeString(normalized.target, `${fieldName}.target`, { required: true }),
    status: normalizeString(normalized.status, `${fieldName}.status`, { required: true }),
    handle: normalizeBytes32(normalized.handle, `${fieldName}.handle`),
    requestedAt: normalized.requestedAt == null ? null : Number(normalized.requestedAt),
    verifiedAt: normalized.verifiedAt == null ? null : Number(normalized.verifiedAt),
    verifiedTxHash: normalizeBytes32(normalized.verifiedTxHash, `${fieldName}.verifiedTxHash`),
  };
}

function getEqualityStatusRank(status) {
  switch (status) {
    case EqualityStatus.VerifiedTrue:
    case EqualityStatus.VerifiedFalse:
      return 3;
    case EqualityStatus.Pending:
      return 2;
    case EqualityStatus.Cleared:
    case EqualityStatus.None:
    default:
      return 1;
  }
}

function mergeEqualityAttestationSnapshot(existing, incoming) {
  if (!existing) return incoming || null;
  if (!incoming) return existing;

  const existingRank = getEqualityStatusRank(existing.status);
  const incomingRank = getEqualityStatusRank(incoming.status);
  if (existingRank > incomingRank) {
    return existing;
  }
  if (incomingRank > existingRank) {
    return incoming;
  }

  return {
    ...existing,
    ...incoming,
    handle: incoming.handle ?? existing.handle ?? null,
    requestedAt: incoming.requestedAt ?? existing.requestedAt ?? null,
    verifiedAt: incoming.verifiedAt ?? existing.verifiedAt ?? null,
    verifiedTxHash: incoming.verifiedTxHash ?? existing.verifiedTxHash ?? null,
  };
}

function assertNoPlaintextPrivacyProofValues(credentialSubject, fieldName = 'vc.credentialSubject') {
  const quantityTotal = credentialSubject?.privacyProofs?.quantityTotal || {};
  const totalPaymentEquality = credentialSubject?.privacyProofs?.totalPaymentEquality || {};

  const forbiddenFields = [
    { value: quantityTotal.quantity, name: `${fieldName}.privacyProofs.quantityTotal.quantity` },
    { value: quantityTotal.value, name: `${fieldName}.privacyProofs.quantityTotal.value` },
    { value: totalPaymentEquality.quantity, name: `${fieldName}.privacyProofs.totalPaymentEquality.quantity` },
    { value: totalPaymentEquality.value, name: `${fieldName}.privacyProofs.totalPaymentEquality.value` },
  ];

  for (const field of forbiddenFields) {
    if (field.value == null) continue;
    if (String(field.value).trim().length > 0) {
      throw new Error(`${field.name} must be empty for schemaVersion 6.1 commitment VRCs`);
    }
  }
}

function buildVcArchiveMetadata(vc) {
  const schemaVersion = normalizeString(vc?.schemaVersion, 'vc.schemaVersion') || null;
  const credentialSubject = vc?.credentialSubject || {};
  const paymentBridge = credentialSubject?.paymentBridge || null;
  const equalityAttestations = credentialSubject?.equalityAttestations || {};
  const sellerBondAttestation = equalityAttestations?.sellerBond || null;
  const transporterBondAttestation = equalityAttestations?.transporterBond || null;
  const proofSource = credentialSubject?.attestation?.proofSource || null;

  if (schemaVersion === '6.0' || schemaVersion === '6.1') {
    if (paymentBridge) {
      validatePaymentBridgeArtifact(paymentBridge, 'vc.credentialSubject.paymentBridge');
    }
    if (sellerBondAttestation) {
      validateEqualityAttestationRecord(
        normalizeEqualityAttestationForValidation(sellerBondAttestation),
        'vc.credentialSubject.equalityAttestations.sellerBond'
      );
    }
    if (transporterBondAttestation) {
      validateEqualityAttestationRecord(
        normalizeEqualityAttestationForValidation(transporterBondAttestation),
        'vc.credentialSubject.equalityAttestations.transporterBond'
      );
    }

    if (schemaVersion === '6.1') {
      assertNoPlaintextPrivacyProofValues(credentialSubject, 'vc.credentialSubject');
    }
  }

  return {
    schemaVersion,
    credentialTypes: Array.isArray(vc?.type) ? vc.type.map((entry) => String(entry)) : [],
    attestationVersion: normalizeString(
      credentialSubject?.attestation?.attestationVersion,
      'vc.credentialSubject.attestation.attestationVersion'
    ),
    contextHash: normalizeString(
      paymentBridge?.contextHash || credentialSubject?.attestation?.contextHash,
      'vc.credentialSubject.attestation.contextHash'
    ),
    proofSourceType: normalizeString(proofSource?.type, 'vc.credentialSubject.attestation.proofSource.type'),
    proofSourceVersion: normalizeString(
      proofSource?.version,
      'vc.credentialSubject.attestation.proofSource.version'
    ),
    paymentBridgeHash: normalizeString(paymentBridge?.bridgeHash, 'vc.credentialSubject.paymentBridge.bridgeHash'),
    paymentBridgeStatus: normalizeString(
      paymentBridge?.verification?.status,
      'vc.credentialSubject.paymentBridge.verification.status'
    ),
    paymentBridgeMethod: normalizeString(
      paymentBridge?.verification?.method,
      'vc.credentialSubject.paymentBridge.verification.method'
    ),
    sellerBondAttestationStatus: normalizeString(
      sellerBondAttestation?.status,
      'vc.credentialSubject.equalityAttestations.sellerBond.status'
    ),
    transporterBondAttestationStatus: normalizeString(
      transporterBondAttestation?.status,
      'vc.credentialSubject.equalityAttestations.transporterBond.status'
    ),
  };
}

function tryParseDecimalBigInt(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function validateOrderVcBinding(vcCid, vcHash, fieldPrefix = 'orderVc') {
  const normalizedCid = normalizeString(vcCid, `${fieldPrefix}.cid`);
  const normalizedHash = normalizeBytes32(vcHash, `${fieldPrefix}.hash`);

  if (
    !normalizedCid ||
    !normalizedHash ||
    normalizedHash === '0x0000000000000000000000000000000000000000000000000000000000000000'
  ) {
    return;
  }

  const computedHash = keccak256(toUtf8Bytes(normalizedCid));
  if (computedHash.toLowerCase() !== normalizedHash.toLowerCase()) {
    throw new RequestValidationError(`${fieldPrefix} hash does not match cid`);
  }
}

function validateBridgeCoherence({ unitPriceWei, quantityProof, totalProof, paymentProof }, fieldPrefix = 'body') {
  const quantityValue = tryParseDecimalBigInt(quantityProof?.quantity);
  const quantityUnitPrice = tryParseDecimalBigInt(quantityProof?.unitPriceWei);
  const explicitUnitPrice = tryParseDecimalBigInt(unitPriceWei);
  const totalValue = tryParseDecimalBigInt(totalProof?.value);
  const paymentValue = tryParseDecimalBigInt(paymentProof?.value);
  const resolvedUnitPrice = explicitUnitPrice ?? quantityUnitPrice;

  if (
    quantityValue != null &&
    resolvedUnitPrice != null &&
    totalValue != null &&
    quantityValue * resolvedUnitPrice !== totalValue
  ) {
    throw new RequestValidationError(
      `${fieldPrefix} bridge data is inconsistent: quantity * unitPriceWei must equal totalProof.value`
    );
  }

  if (totalValue != null && paymentValue != null && totalValue !== paymentValue) {
    throw new RequestValidationError(
      `${fieldPrefix} bridge data is inconsistent: totalProof.value must equal paymentProof.value`
    );
  }
}

function buildVcArchiveParams(cid, vc, source = 'api') {
  const normalizedCid = normalizeString(cid, 'cid', { required: true }).replace(/^ipfs:\/\//, '').trim();
  const canonicalJson = canonicalizeJson(vc);
  const credentialSubject = vc?.credentialSubject || {};
  const metadata = buildVcArchiveMetadata(vc);

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
    metadata,
  };
}

function buildLocalArchiveCid(vc) {
  const canonicalJson = canonicalizeJson(vc);
  const payloadHash = keccak256(toUtf8Bytes(canonicalJson)).slice(2).toLowerCase();
  return `local-${payloadHash}`;
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
    transporterAddress: row.transporter_address,
    status: row.status,
    phase: row.order_phase == null ? null : Number(row.order_phase),
    delivered: row.delivered_flag == null ? null : Boolean(row.delivered_flag),
    memoHash: row.memo_hash,
    railgunTxRef: row.railgun_tx_ref,
    unitPriceWei: row.unit_price_wei,
    unitPriceHash: row.unit_price_hash,
    paymentToken: row.payment_token,
    buyerDepositTxHash: row.buyer_deposit_tx_hash,
    buyerDepositReference: row.buyer_deposit_reference,
    sellerBondAttestation: parseMaybeJson(row.seller_bond_attestation_json),
    transporterBondAttestation: parseMaybeJson(row.transporter_bond_attestation_json),
    quantityCommitment: row.quantity_commitment,
    quantityProof: parseMaybeJson(row.quantity_proof),
    totalCommitment: row.total_commitment,
    totalProof: parseMaybeJson(row.total_proof),
    paymentCommitment: row.payment_commitment,
    paymentProof: parseMaybeJson(row.payment_proof),
    contextHash: row.context_hash,
    orderVcCid: row.order_vc_cid,
    orderVcHash: row.order_vc_hash,
    deliveryTxHash: row.delivery_tx_hash,
    deliveryConfirmedVcHash: row.delivery_confirmed_vc_hash,
    deliveryConfirmedTransporter: row.delivery_confirmed_transporter,
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
    transporter_address,
    status,
    order_phase,
    delivered_flag,
    memo_hash,
    railgun_tx_ref,
    unit_price_wei,
    unit_price_hash,
    payment_token,
    buyer_deposit_tx_hash,
    buyer_deposit_reference,
    seller_bond_attestation_json,
    transporter_bond_attestation_json,
    quantity_commitment,
    quantity_proof,
    total_commitment,
    total_proof,
    payment_commitment,
    payment_proof,
    context_hash,
    order_vc_cid,
    order_vc_hash,
    delivery_tx_hash,
    delivery_confirmed_vc_hash,
    delivery_confirmed_transporter,
    updated_at
  ) VALUES (
    @orderId,
    @productAddress,
    @productId,
    @escrowAddress,
    @chainId,
    @sellerAddress,
    @buyerAddress,
    @transporterAddress,
    @status,
    @orderPhase,
    @deliveredFlag,
    @memoHash,
    @railgunTxRef,
    @unitPriceWei,
    @unitPriceHash,
    @paymentToken,
    @buyerDepositTxHash,
    @buyerDepositReference,
    @sellerBondAttestation,
    @transporterBondAttestation,
    @quantityCommitment,
    @quantityProof,
    @totalCommitment,
    @totalProof,
    @paymentCommitment,
    @paymentProof,
    @contextHash,
    @orderVcCid,
    @orderVcHash,
    @deliveryTxHash,
    @deliveryConfirmedVcHash,
    @deliveryConfirmedTransporter,
    datetime('now')
  )
  ON CONFLICT(order_id) DO UPDATE SET
    product_address = excluded.product_address,
    product_id = excluded.product_id,
    escrow_address = excluded.escrow_address,
    chain_id = excluded.chain_id,
    seller_address = excluded.seller_address,
    buyer_address = excluded.buyer_address,
    transporter_address = excluded.transporter_address,
    status = excluded.status,
    order_phase = excluded.order_phase,
    delivered_flag = excluded.delivered_flag,
    memo_hash = excluded.memo_hash,
    railgun_tx_ref = excluded.railgun_tx_ref,
    unit_price_wei = excluded.unit_price_wei,
    unit_price_hash = excluded.unit_price_hash,
    payment_token = excluded.payment_token,
    buyer_deposit_tx_hash = excluded.buyer_deposit_tx_hash,
    buyer_deposit_reference = excluded.buyer_deposit_reference,
    seller_bond_attestation_json = excluded.seller_bond_attestation_json,
    transporter_bond_attestation_json = excluded.transporter_bond_attestation_json,
    quantity_commitment = excluded.quantity_commitment,
    quantity_proof = excluded.quantity_proof,
    total_commitment = excluded.total_commitment,
    total_proof = excluded.total_proof,
    payment_commitment = excluded.payment_commitment,
    payment_proof = excluded.payment_proof,
    context_hash = excluded.context_hash,
    order_vc_cid = excluded.order_vc_cid,
    order_vc_hash = excluded.order_vc_hash,
    delivery_tx_hash = excluded.delivery_tx_hash,
    delivery_confirmed_vc_hash = excluded.delivery_confirmed_vc_hash,
    delivery_confirmed_transporter = excluded.delivery_confirmed_transporter,
    updated_at = datetime('now')
`);

const stmtGetOrder = db.prepare('SELECT * FROM product_orders WHERE order_id = ?');
const stmtGetOrderByVcHash = db.prepare(
  'SELECT * FROM product_orders WHERE order_vc_hash = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1'
);
const stmtGetOrderByVcCid = db.prepare(
  'SELECT * FROM product_orders WHERE order_vc_cid = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1'
);
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

app.get('/health', (_req, res) => {
  return res.json({
    ok: true,
    service: 'backend-api',
    port,
    indexer: getIndexerStatus(),
  });
});

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
    const proofsOk =
      verificationResult?.privacyProofs == null ||
      verificationResult?.privacyProofs?.skipped === true ||
      (
        verificationResult?.privacyProofs?.quantityTotal === true &&
        verificationResult?.privacyProofs?.totalPayment === true
      );

    return res.json({
      success: issuerOk && holderOk && proofsOk,
      message: 'VC verification complete.',
      issuer: verificationResult.issuer,
      holder: verificationResult.holder,
      privacyProofs: verificationResult.privacyProofs,
    });
  } catch (error) {
    console.error('Error verifying VC:', error);
    if (error instanceof RequestValidationError) {
      return res.status(400).json({ error: error.message });
    }
    const details = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'production' ? {} : { details }),
    });
  }
});

app.post('/fetch-vc', async (req, res) => {
  try {
    validateFetchVcBody(req.body || {});
    const { cid } = req.body;
    const vcJsonData = await fetchVC(cid);
    let archiveWarning = null;
    try {
      const archiveParams = buildVcArchiveParams(cid, vcJsonData, 'fetch-cache');
      stmtUpsertVcArchive.run(archiveParams);
      stmtInsertVcStatusIfMissing.run(buildVcStatusParams(archiveParams));
    } catch (archiveError) {
      archiveWarning = archiveError instanceof Error ? archiveError.message : String(archiveError);
      console.warn('Skipping VC archive upsert for fetch-vc due to validation warning:', archiveWarning);
    }
    return res.json({
      message: 'VC fetching complete.',
      vc: vcJsonData,
      ...(archiveWarning ? { archiveWarning } : {}),
    });
  } catch (error) {
    console.error('Error fetching VC:', error);
    if (error instanceof RequestValidationError) {
      return res.status(400).json({ error: error.message });
    }
    const details = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      error: 'Internal server error',
      ...(process.env.NODE_ENV === 'production' ? {} : { details }),
    });
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
        metadata: params.metadata,
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
      transporterAddress: null,
      status: normalizeString(status, 'status', { required: true }),
      orderPhase: null,
      deliveredFlag: null,
      memoHash: normalizeBytes32(memoHash, 'memoHash'),
      railgunTxRef: normalizeBytes32(railgunTxRef, 'railgunTxRef'),
      unitPriceWei: normalizeString(unitPriceWei, 'unitPriceWei', { required: true }),
      unitPriceHash: normalizeBytes32(unitPriceHash, 'unitPriceHash', { required: true }),
      paymentToken: null,
      buyerDepositTxHash: null,
      buyerDepositReference: null,
      sellerBondAttestation: null,
      transporterBondAttestation: null,
      quantityCommitment: normalizeBytes32(quantityCommitment, 'quantityCommitment'),
      quantityProof: stringifyMaybeJson(quantityProof),
      totalCommitment: normalizeBytes32(totalCommitment, 'totalCommitment'),
      totalProof: stringifyMaybeJson(totalProof),
      paymentCommitment: normalizeBytes32(paymentCommitment, 'paymentCommitment'),
      paymentProof: stringifyMaybeJson(paymentProof),
      contextHash: resolvedContextHash,
      orderVcCid: orderVcCid || null,
      orderVcHash: normalizeBytes32(orderVcHash, 'orderVcHash'),
      deliveryTxHash: null,
      deliveryConfirmedVcHash: null,
      deliveryConfirmedTransporter: null,
    });

    const row = stmtGetOrder.get(normalizedOrderId);
    return res.status(201).json({ success: true, order: mapOrderRow(row) });
  } catch (error) {
    console.error('Error saving order:', error);
    return handleValidationError(res, error, 'Invalid order payload');
  }
});

app.post('/vc-upload', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.vc || typeof body.vc !== 'object' || Array.isArray(body.vc)) {
      throw new RequestValidationError('vc must be a JSON object');
    }

    let cid;
    let storage = 'pinata';
    try {
      cid = await uploadVcToPinataJson(body.vc);
    } catch (error) {
      console.warn('Pinata upload unavailable, using local VC archive fallback:', error?.message || error);
      cid = buildLocalArchiveCid(body.vc);
      storage = 'local-archive';
    }

    const params = buildVcArchiveParams(cid, body.vc, body.source || 'backend-upload');
    stmtUpsertVcArchive.run(params);
    stmtInsertVcStatusIfMissing.run(buildVcStatusParams(params));
    const row = stmtGetVcArchive.get(params.cid);

    return res.status(201).json({
      success: true,
      cid,
      storage,
      archive: {
        cid: row.cid,
        vcPayloadHash: row.vc_payload_hash,
        productAddress: row.product_address,
        orderId: row.order_id,
        source: row.source,
        metadata: params.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error('Error uploading VC to Pinata:', error);
    return handleValidationError(res, error, 'Failed to upload VC');
  }
});

app.post('/erc7984/orders/snapshot', (req, res) => {
  try {
    validateErc7984OrderSnapshotBody(req.body || {});
    const normalizedOrderId = normalizeBytes32(req.body.orderId, 'orderId', { required: true });
    const existingOrder = mapOrderRow(stmtGetOrder.get(normalizedOrderId));
    const hasExplicitOrderVcCid = Object.prototype.hasOwnProperty.call(req.body || {}, 'orderVcCid');
    const normalizedOrderVcCid = normalizeString(req.body.orderVcCid, 'orderVcCid');
    const sellerBondAttestation = mergeEqualityAttestationSnapshot(
      existingOrder?.sellerBondAttestation || null,
      normalizeEqualityAttestationSnapshot(
        req.body.sellerBondAttestation,
        'body.sellerBondAttestation',
        normalizedOrderId
      )
    );
    const transporterBondAttestation = mergeEqualityAttestationSnapshot(
      existingOrder?.transporterBondAttestation || null,
      normalizeEqualityAttestationSnapshot(
        req.body.transporterBondAttestation,
        'body.transporterBondAttestation',
        normalizedOrderId
      )
    );
    const mergedUnitPriceWei =
      req.body.unitPriceWei == null
        ? (existingOrder?.unitPriceWei ?? '')
        : String(req.body.unitPriceWei);
    const mergedQuantityProof = req.body.quantityProof ?? existingOrder?.quantityProof ?? null;
    const mergedTotalProof = req.body.totalProof ?? existingOrder?.totalProof ?? null;
    const mergedPaymentProof = req.body.paymentProof ?? existingOrder?.paymentProof ?? null;
    const touchesBridgeFields = [
      'unitPriceWei',
      'quantityProof',
      'totalProof',
      'paymentProof',
    ].some((fieldName) => Object.prototype.hasOwnProperty.call(req.body || {}, fieldName));

    if (touchesBridgeFields) {
      validateBridgeCoherence(
        {
          unitPriceWei: mergedUnitPriceWei,
          quantityProof: mergedQuantityProof,
          totalProof: mergedTotalProof,
          paymentProof: mergedPaymentProof,
        },
        'body'
      );
    }

    validateOrderVcBinding(
      hasExplicitOrderVcCid ? normalizedOrderVcCid ?? null : existingOrder?.orderVcCid ?? null,
      req.body.orderVcHash ?? existingOrder?.orderVcHash ?? null,
      'body.orderVc'
    );

    stmtUpsertOrder.run({
      orderId: normalizedOrderId,
      productAddress: normalizeAddress(req.body.productAddress, 'productAddress', { required: true }),
      productId: req.body.productId == null ? (existingOrder?.productId ?? '') : String(req.body.productId),
      escrowAddress: normalizeAddress(
        req.body.escrowAddress || req.body.productAddress,
        'escrowAddress',
        { required: true }
      ),
      chainId: normalizeString(req.body.chainId, 'chainId', { required: true }),
      sellerAddress: normalizeAddress(req.body.sellerAddress, 'sellerAddress', { required: true }),
      buyerAddress: normalizeAddress(req.body.buyerAddress, 'buyerAddress') ?? existingOrder?.buyerAddress ?? null,
      transporterAddress:
        normalizeAddress(req.body.transporterAddress, 'transporterAddress') ?? existingOrder?.transporterAddress ?? null,
      status: normalizeString(req.body.status, 'status', { required: true }),
      orderPhase: req.body.phase == null ? existingOrder?.phase ?? null : Number(req.body.phase),
      deliveredFlag:
        req.body.delivered == null
          ? (existingOrder?.delivered == null ? null : (existingOrder.delivered ? 1 : 0))
          : (req.body.delivered ? 1 : 0),
      memoHash: existingOrder?.memoHash ?? null,
      railgunTxRef: existingOrder?.railgunTxRef ?? null,
      unitPriceWei: mergedUnitPriceWei,
      unitPriceHash: normalizeBytes32(req.body.unitPriceHash, 'unitPriceHash', { required: true }),
      paymentToken: normalizeAddress(req.body.paymentToken, 'paymentToken') ?? existingOrder?.paymentToken ?? null,
      buyerDepositTxHash:
        normalizeBytes32(req.body.buyerDepositTxHash, 'buyerDepositTxHash') ?? existingOrder?.buyerDepositTxHash ?? null,
      buyerDepositReference:
        normalizeBytes32(req.body.buyerDepositReference, 'buyerDepositReference')
        ?? existingOrder?.buyerDepositReference
        ?? null,
      sellerBondAttestation: stringifyMaybeJson(sellerBondAttestation),
      transporterBondAttestation: stringifyMaybeJson(transporterBondAttestation),
      quantityCommitment:
        normalizeBytes32(req.body.quantityCommitment, 'quantityCommitment') ?? existingOrder?.quantityCommitment ?? null,
      quantityProof: stringifyMaybeJson(mergedQuantityProof),
      totalCommitment:
        normalizeBytes32(req.body.totalCommitment, 'totalCommitment') ?? existingOrder?.totalCommitment ?? null,
      totalProof: stringifyMaybeJson(mergedTotalProof),
      paymentCommitment:
        normalizeBytes32(req.body.paymentCommitment, 'paymentCommitment') ?? existingOrder?.paymentCommitment ?? null,
      paymentProof: stringifyMaybeJson(mergedPaymentProof),
      contextHash: normalizeBytes32(req.body.contextHash, 'contextHash', { required: true }),
      orderVcCid: hasExplicitOrderVcCid ? normalizedOrderVcCid ?? null : existingOrder?.orderVcCid ?? null,
      orderVcHash: normalizeBytes32(req.body.orderVcHash, 'orderVcHash') ?? existingOrder?.orderVcHash ?? null,
      deliveryTxHash:
        normalizeBytes32(req.body.deliveryTxHash, 'deliveryTxHash') ?? existingOrder?.deliveryTxHash ?? null,
      deliveryConfirmedVcHash:
        normalizeBytes32(req.body.deliveryConfirmedVcHash, 'deliveryConfirmedVcHash')
        ?? existingOrder?.deliveryConfirmedVcHash
        ?? null,
      deliveryConfirmedTransporter:
        normalizeAddress(req.body.deliveryConfirmedTransporter, 'deliveryConfirmedTransporter')
        ?? existingOrder?.deliveryConfirmedTransporter
        ?? null,
    });

    return res.status(201).json({
      success: true,
      order: mapOrderRow(stmtGetOrder.get(normalizedOrderId)),
    });
  } catch (error) {
    console.error('Error saving ERC-7984 order snapshot:', error);
    return handleValidationError(res, error, 'Invalid ERC-7984 order snapshot payload');
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
        transporterAddress: null,
        status: normalizeString(order.status, 'order.status', { required: true }),
        orderPhase: null,
        deliveredFlag: null,
        memoHash: normalizeBytes32(order.memoHash, 'order.memoHash', { required: true }),
        railgunTxRef: normalizeBytes32(order.railgunTxRef, 'order.railgunTxRef', { required: true }),
        unitPriceWei: normalizeString(order.unitPriceWei, 'order.unitPriceWei', { required: true }),
        unitPriceHash: normalizeBytes32(order.unitPriceHash, 'order.unitPriceHash', { required: true }),
        paymentToken: null,
        buyerDepositTxHash: null,
        buyerDepositReference: null,
        sellerBondAttestation: null,
        transporterBondAttestation: null,
        quantityCommitment: normalizeBytes32(order.quantityCommitment, 'order.quantityCommitment', { required: true }),
        quantityProof: stringifyMaybeJson(order.quantityProof),
        totalCommitment: normalizeBytes32(order.totalCommitment, 'order.totalCommitment', { required: true }),
        totalProof: stringifyMaybeJson(order.totalProof),
        paymentCommitment: normalizeBytes32(order.paymentCommitment, 'order.paymentCommitment', { required: true }),
        paymentProof: stringifyMaybeJson(order.paymentProof),
        contextHash: resolvedContextHash,
        orderVcCid: order.orderVcCid || null,
        orderVcHash: normalizeBytes32(order.orderVcHash, 'order.orderVcHash'),
        deliveryTxHash: null,
        deliveryConfirmedVcHash: null,
        deliveryConfirmedTransporter: null,
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

app.get('/orders/by-vc-hash/:vcHash', (req, res) => {
  try {
    const vcHash = normalizeBytes32(req.params.vcHash, 'vcHash', { required: true });
    const row = stmtGetOrderByVcHash.get(vcHash);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(mapOrderRow(row));
  } catch (error) {
    console.error('Error fetching order by VC hash:', error);
    return res.status(400).json({ error: error.message || 'Invalid vcHash' });
  }
});

app.get('/orders/by-vc-cid/:vcCid', (req, res) => {
  try {
    const normalizedVcCid = normalizeString(decodeURIComponent(req.params.vcCid), 'vcCid', { required: true })
      .replace(/^ipfs:\/\//, '')
      .trim();
    const row = stmtGetOrderByVcCid.get(normalizedVcCid);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json(mapOrderRow(row));
  } catch (error) {
    console.error('Error fetching order by VC CID:', error);
    return res.status(400).json({ error: error.message || 'Invalid vcCid' });
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
      transporterAddress: existingOrder?.transporterAddress ?? null,
      status: mapOnChainOrderPhaseToStatus(onChainOrder.phase, existingOrder?.status),
      orderPhase: onChainOrder.phase,
      deliveredFlag: onChainOrder.phase === 4 ? 1 : 0,
      memoHash: onChainOrder.memoHash,
      railgunTxRef: onChainOrder.railgunTxRef,
      unitPriceWei,
      unitPriceHash,
      paymentToken: existingOrder?.paymentToken ?? null,
      buyerDepositTxHash: existingOrder?.buyerDepositTxHash ?? null,
      buyerDepositReference: existingOrder?.buyerDepositReference ?? null,
      sellerBondAttestation: stringifyMaybeJson(existingOrder?.sellerBondAttestation ?? null),
      transporterBondAttestation: stringifyMaybeJson(existingOrder?.transporterBondAttestation ?? null),
      quantityCommitment: onChainOrder.quantityCommitment,
      quantityProof: stringifyMaybeJson(existingOrder?.quantityProof ?? null),
      totalCommitment: onChainOrder.totalCommitment,
      totalProof: stringifyMaybeJson(existingOrder?.totalProof ?? null),
      paymentCommitment: onChainOrder.paymentCommitment,
      paymentProof: stringifyMaybeJson(existingOrder?.paymentProof ?? null),
      contextHash: resolvedContextHash,
      orderVcCid: existingOrder?.orderVcCid || null,
      orderVcHash: onChainOrder.vcHash ?? existingOrder?.orderVcHash ?? null,
      deliveryTxHash: existingOrder?.deliveryTxHash ?? null,
      deliveryConfirmedVcHash: existingOrder?.deliveryConfirmedVcHash ?? null,
      deliveryConfirmedTransporter: existingOrder?.deliveryConfirmedTransporter ?? null,
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
    validateOrderVcBinding(vcCid, vcHash, 'body.orderVc');
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
