const { isAddress } = require('ethers');

const ORDER_STATUSES = new Set([
  'payment_pending_recording',
  'payment_recorded',
  'order_confirmed',
  'bound',
  'delivered',
  'expired',
  'paid_private',
]);

const VC_STATUS_VALUES = new Set(['active', 'revoked', 'suspended']);

class RequestValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertPlainObject(value, fieldName) {
  if (!isPlainObject(value)) {
    throw new RequestValidationError(`${fieldName} must be an object`);
  }
}

function assertNoUnknownKeys(value, fieldName, allowedKeys) {
  assertPlainObject(value, fieldName);
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new RequestValidationError(`${fieldName}.${key} is not allowed`);
    }
  }
}

function assertRequiredKeys(value, fieldName, requiredKeys) {
  for (const key of requiredKeys) {
    if (!(key in value) || value[key] == null || value[key] === '') {
      throw new RequestValidationError(`${fieldName}.${key} is required`);
    }
  }
}

function assertOptionalString(value, fieldName) {
  if (value == null) return;
  if (typeof value !== 'string' || value.length === 0) {
    throw new RequestValidationError(`${fieldName} must be a non-empty string`);
  }
}

function assertOptionalDecimalString(value, fieldName) {
  if (value == null) return;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new RequestValidationError(`${fieldName} must be a decimal string`);
  }
}

function assertOptionalAddress(value, fieldName) {
  if (value == null) return;
  const candidate =
    typeof value === 'string' && /^0x/i.test(value)
      ? `0x${value.slice(2)}`
      : value;
  if (typeof candidate !== 'string' || !isAddress(candidate)) {
    throw new RequestValidationError(`${fieldName} must be a valid address`);
  }
}

function assertOptionalBytes32(value, fieldName) {
  if (value == null) return;
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/i.test(value)) {
    throw new RequestValidationError(`${fieldName} must be a 32-byte hex string`);
  }
}

function assertOptionalNumber(value, fieldName) {
  if (value == null) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RequestValidationError(`${fieldName} must be a finite number`);
  }
}

function assertOptionalBoolean(value, fieldName) {
  if (value == null) return;
  if (typeof value !== 'boolean') {
    throw new RequestValidationError(`${fieldName} must be a boolean`);
  }
}

function assertOptionalJsonLike(value, fieldName) {
  if (value == null) return;
  const type = typeof value;
  if (
    type === 'string' ||
    type === 'number' ||
    type === 'boolean' ||
    Array.isArray(value) ||
    isPlainObject(value)
  ) {
    return;
  }
  throw new RequestValidationError(`${fieldName} must be JSON-serializable`);
}

function assertOptionalObjectLike(value, fieldName) {
  if (value == null) return;
  if (!isPlainObject(value)) {
    throw new RequestValidationError(`${fieldName} must be an object`);
  }
}

function validateContextObject(context, fieldName = 'context') {
  if (context == null) return;
  assertNoUnknownKeys(context, fieldName, [
    'orderId',
    'memoHash',
    'railgunTxRef',
    'productId',
    'chainId',
    'escrowAddr',
    'unitPriceHash',
  ]);
  assertRequiredKeys(context, fieldName, [
    'orderId',
    'memoHash',
    'railgunTxRef',
    'productId',
    'chainId',
    'escrowAddr',
    'unitPriceHash',
  ]);
  assertOptionalBytes32(context.orderId, `${fieldName}.orderId`);
  assertOptionalBytes32(context.memoHash, `${fieldName}.memoHash`);
  assertOptionalBytes32(context.railgunTxRef, `${fieldName}.railgunTxRef`);
  assertOptionalString(context.productId, `${fieldName}.productId`);
  assertOptionalString(context.chainId, `${fieldName}.chainId`);
  assertOptionalAddress(context.escrowAddr, `${fieldName}.escrowAddr`);
  assertOptionalBytes32(context.unitPriceHash, `${fieldName}.unitPriceHash`);
}

function validateOnChainOrder(onChainOrder, fieldName = 'onChainOrder') {
  assertNoUnknownKeys(onChainOrder, fieldName, [
    'buyerAddress',
    'buyer',
    'memoHash',
    'railgunTxRef',
    'quantityCommitment',
    'totalCommitment',
    'paymentCommitment',
    'contextHash',
    'vcHash',
    'purchaseTimestamp',
    'orderConfirmedTimestamp',
    'phase',
    'exists',
  ]);
  assertRequiredKeys(onChainOrder, fieldName, [
    'memoHash',
    'railgunTxRef',
    'quantityCommitment',
    'totalCommitment',
    'paymentCommitment',
    'contextHash',
  ]);
  assertOptionalAddress(onChainOrder.buyerAddress ?? onChainOrder.buyer, `${fieldName}.buyerAddress`);
  assertOptionalBytes32(onChainOrder.memoHash, `${fieldName}.memoHash`);
  assertOptionalBytes32(onChainOrder.railgunTxRef, `${fieldName}.railgunTxRef`);
  assertOptionalBytes32(onChainOrder.quantityCommitment, `${fieldName}.quantityCommitment`);
  assertOptionalBytes32(onChainOrder.totalCommitment, `${fieldName}.totalCommitment`);
  assertOptionalBytes32(onChainOrder.paymentCommitment, `${fieldName}.paymentCommitment`);
  assertOptionalBytes32(onChainOrder.contextHash, `${fieldName}.contextHash`);
  assertOptionalBytes32(onChainOrder.vcHash, `${fieldName}.vcHash`);
  assertOptionalNumber(onChainOrder.purchaseTimestamp, `${fieldName}.purchaseTimestamp`);
  assertOptionalNumber(onChainOrder.orderConfirmedTimestamp, `${fieldName}.orderConfirmedTimestamp`);
  assertOptionalNumber(onChainOrder.phase, `${fieldName}.phase`);
  assertOptionalBoolean(onChainOrder.exists, `${fieldName}.exists`);
}

function validateVerifyVcBody(body) {
  assertNoUnknownKeys(body, 'body', ['vc', 'contractAddress']);
  if (!('vc' in body) || body.vc == null) {
    throw new RequestValidationError('body.vc is required');
  }
  assertPlainObject(body.vc, 'body.vc');
  assertOptionalAddress(body.contractAddress, 'body.contractAddress');
}

function validateVerifyVcChainBody(body) {
  assertNoUnknownKeys(body, 'body', ['cid', 'maxDepth']);
  assertRequiredKeys(body, 'body', ['cid']);
  assertOptionalString(body.cid, 'body.cid');
  assertOptionalNumber(body.maxDepth, 'body.maxDepth');
}

function validateFetchVcBody(body) {
  assertNoUnknownKeys(body, 'body', ['cid']);
  assertRequiredKeys(body, 'body', ['cid']);
  assertOptionalString(body.cid, 'body.cid');
}

function validateMetadataBody(body) {
  assertNoUnknownKeys(body, 'body', [
    'productAddress',
    'productMeta',
    'priceWei',
    'priceCommitment',
    'sellerRailgunAddress',
    'unitPriceWei',
    'unitPriceHash',
    'listingSnapshotCid',
    'listingSnapshotJson',
    'listingSnapshotSig',
    'schemaVersion',
    'vcCid',
  ]);
  assertRequiredKeys(body, 'body', ['productAddress', 'productMeta']);
  assertOptionalAddress(body.productAddress, 'body.productAddress');
  assertPlainObject(body.productMeta, 'body.productMeta');
  assertOptionalDecimalString(body.priceWei, 'body.priceWei');
  assertOptionalBytes32(body.priceCommitment, 'body.priceCommitment');
  assertOptionalString(body.sellerRailgunAddress, 'body.sellerRailgunAddress');
  assertOptionalDecimalString(body.unitPriceWei, 'body.unitPriceWei');
  assertOptionalBytes32(body.unitPriceHash, 'body.unitPriceHash');
  assertOptionalString(body.listingSnapshotCid, 'body.listingSnapshotCid');
  assertOptionalJsonLike(body.listingSnapshotJson, 'body.listingSnapshotJson');
  assertOptionalString(body.listingSnapshotSig, 'body.listingSnapshotSig');
  assertOptionalString(body.schemaVersion, 'body.schemaVersion');
}

function validateMetadataVcCidBody(body) {
  assertNoUnknownKeys(body, 'body', ['vcCid']);
  assertRequiredKeys(body, 'body', ['vcCid']);
  assertOptionalString(body.vcCid, 'body.vcCid');
}

function validateBuyerSecretsBody(body) {
  assertNoUnknownKeys(body, 'body', [
    'productAddress',
    'buyerAddress',
    'encryptedBlob',
    'disclosurePubkey',
    'cPay',
    'cPayProof',
  ]);
  assertRequiredKeys(body, 'body', [
    'productAddress',
    'buyerAddress',
    'encryptedBlob',
    'disclosurePubkey',
  ]);
  assertOptionalAddress(body.productAddress, 'body.productAddress');
  assertOptionalAddress(body.buyerAddress, 'body.buyerAddress');
  assertOptionalJsonLike(body.encryptedBlob, 'body.encryptedBlob');
  assertOptionalString(body.disclosurePubkey, 'body.disclosurePubkey');
  assertOptionalBytes32(body.cPay, 'body.cPay');
  assertOptionalJsonLike(body.cPayProof, 'body.cPayProof');
}

function validateBuyerEncryptedOpeningBody(body) {
  assertNoUnknownKeys(body, 'body', ['encryptedOpening']);
  assertRequiredKeys(body, 'body', ['encryptedOpening']);
  assertOptionalJsonLike(body.encryptedOpening, 'body.encryptedOpening');
}

function validateBuyerEqualityProofBody(body) {
  assertNoUnknownKeys(body, 'body', ['equalityProof']);
  assertRequiredKeys(body, 'body', ['equalityProof']);
  assertOptionalJsonLike(body.equalityProof, 'body.equalityProof');
}

function validateOrderBody(body) {
  assertNoUnknownKeys(body, 'body', [
    'orderId',
    'productAddress',
    'productId',
    'escrowAddress',
    'chainId',
    'sellerAddress',
    'buyerAddress',
    'status',
    'memoHash',
    'railgunTxRef',
    'unitPriceWei',
    'unitPriceHash',
    'quantityCommitment',
    'quantityProof',
    'totalCommitment',
    'totalProof',
  'paymentCommitment',
  'paymentProof',
  'disclosurePubkey',
  'encryptedBlob',
  'encryptedQuantityOpening',
  'encryptedTotalOpening',
  'quantityTotalProof',
  'paymentEqualityProof',
  'proofBundle',
  'proofEmbeddedInVc',
  'contextHash',
  'context',
  'orderVcCid',
    'orderVcHash',
  ]);
  assertRequiredKeys(body, 'body', [
    'orderId',
    'productAddress',
    'productId',
    'chainId',
    'sellerAddress',
    'status',
    'unitPriceWei',
    'unitPriceHash',
  ]);
  assertOptionalBytes32(body.orderId, 'body.orderId');
  assertOptionalAddress(body.productAddress, 'body.productAddress');
  assertOptionalString(body.productId, 'body.productId');
  assertOptionalAddress(body.escrowAddress, 'body.escrowAddress');
  assertOptionalString(body.chainId, 'body.chainId');
  assertOptionalAddress(body.sellerAddress, 'body.sellerAddress');
  assertOptionalAddress(body.buyerAddress, 'body.buyerAddress');
  assertOptionalString(body.status, 'body.status');
  if (body.status && !ORDER_STATUSES.has(body.status)) {
    throw new RequestValidationError('body.status is not allowed');
  }
  assertOptionalBytes32(body.memoHash, 'body.memoHash');
  assertOptionalBytes32(body.railgunTxRef, 'body.railgunTxRef');
  assertOptionalDecimalString(body.unitPriceWei, 'body.unitPriceWei');
  assertOptionalBytes32(body.unitPriceHash, 'body.unitPriceHash');
  assertOptionalBytes32(body.quantityCommitment, 'body.quantityCommitment');
  assertOptionalObjectLike(body.quantityProof, 'body.quantityProof');
  assertOptionalBytes32(body.totalCommitment, 'body.totalCommitment');
  assertOptionalObjectLike(body.totalProof, 'body.totalProof');
  assertOptionalBytes32(body.paymentCommitment, 'body.paymentCommitment');
  assertOptionalObjectLike(body.paymentProof, 'body.paymentProof');
  assertOptionalString(body.disclosurePubkey, 'body.disclosurePubkey');
  assertOptionalJsonLike(body.encryptedBlob, 'body.encryptedBlob');
  assertOptionalJsonLike(body.encryptedQuantityOpening, 'body.encryptedQuantityOpening');
  assertOptionalJsonLike(body.encryptedTotalOpening, 'body.encryptedTotalOpening');
  assertOptionalObjectLike(body.quantityTotalProof, 'body.quantityTotalProof');
  assertOptionalObjectLike(body.paymentEqualityProof, 'body.paymentEqualityProof');
  assertOptionalObjectLike(body.proofBundle, 'body.proofBundle');
  assertOptionalBoolean(body.proofEmbeddedInVc, 'body.proofEmbeddedInVc');
  assertOptionalBytes32(body.contextHash, 'body.contextHash');
  validateContextObject(body.context, 'body.context');
  assertOptionalString(body.orderVcCid, 'body.orderVcCid');
  assertOptionalBytes32(body.orderVcHash, 'body.orderVcHash');
}

function validateOrderAttestation(attestation, fieldName = 'body') {
  assertNoUnknownKeys(attestation, fieldName, [
    'orderId',
    'productAddress',
    'buyerAddress',
    'encryptedBlob',
    'disclosurePubkey',
    'encryptedQuantityOpening',
    'encryptedTotalOpening',
    'quantityTotalProof',
    'paymentEqualityProof',
    'proofBundle',
  ]);
  assertRequiredKeys(attestation, fieldName, ['orderId', 'productAddress', 'buyerAddress', 'disclosurePubkey']);
  assertOptionalBytes32(attestation.orderId, `${fieldName}.orderId`);
  assertOptionalAddress(attestation.productAddress, `${fieldName}.productAddress`);
  assertOptionalAddress(attestation.buyerAddress, `${fieldName}.buyerAddress`);
  assertOptionalJsonLike(attestation.encryptedBlob, `${fieldName}.encryptedBlob`);
  assertOptionalString(attestation.disclosurePubkey, `${fieldName}.disclosurePubkey`);
  assertOptionalJsonLike(attestation.encryptedQuantityOpening, `${fieldName}.encryptedQuantityOpening`);
  assertOptionalJsonLike(attestation.encryptedTotalOpening, `${fieldName}.encryptedTotalOpening`);
  assertOptionalObjectLike(attestation.quantityTotalProof, `${fieldName}.quantityTotalProof`);
  assertOptionalObjectLike(attestation.paymentEqualityProof, `${fieldName}.paymentEqualityProof`);
  assertOptionalObjectLike(attestation.proofBundle, `${fieldName}.proofBundle`);
}

function validateRecoveryBundleBody(body) {
  assertNoUnknownKeys(body, 'body', ['order', 'attestation']);
  assertRequiredKeys(body, 'body', ['order']);
  validateOrderBody(body.order);
  if (body.attestation != null) {
    assertNoUnknownKeys(body.attestation, 'body.attestation', [
      'encryptedBlob',
      'disclosurePubkey',
      'encryptedQuantityOpening',
      'encryptedTotalOpening',
      'quantityTotalProof',
      'paymentEqualityProof',
      'proofBundle',
    ]);
    assertRequiredKeys(body.attestation, 'body.attestation', ['disclosurePubkey']);
    assertOptionalJsonLike(body.attestation.encryptedBlob, 'body.attestation.encryptedBlob');
    assertOptionalString(body.attestation.disclosurePubkey, 'body.attestation.disclosurePubkey');
    assertOptionalJsonLike(body.attestation.encryptedQuantityOpening, 'body.attestation.encryptedQuantityOpening');
    assertOptionalJsonLike(body.attestation.encryptedTotalOpening, 'body.attestation.encryptedTotalOpening');
    assertOptionalObjectLike(body.attestation.quantityTotalProof, 'body.attestation.quantityTotalProof');
    assertOptionalObjectLike(body.attestation.paymentEqualityProof, 'body.attestation.paymentEqualityProof');
    assertOptionalObjectLike(body.attestation.proofBundle, 'body.attestation.proofBundle');
  }
}

function validateReconcileBody(body) {
  assertNoUnknownKeys(body, 'body', [
    'productAddress',
    'onChainOrder',
    'productId',
    'chainId',
    'sellerAddress',
    'unitPriceWei',
    'unitPriceHash',
  ]);
  assertRequiredKeys(body, 'body', ['productAddress', 'onChainOrder']);
  assertOptionalAddress(body.productAddress, 'body.productAddress');
  validateOnChainOrder(body.onChainOrder, 'body.onChainOrder');
  assertOptionalString(body.productId, 'body.productId');
  assertOptionalString(body.chainId, 'body.chainId');
  assertOptionalAddress(body.sellerAddress, 'body.sellerAddress');
  assertOptionalDecimalString(body.unitPriceWei, 'body.unitPriceWei');
  assertOptionalBytes32(body.unitPriceHash, 'body.unitPriceHash');
}

function validateOrderStatusBody(body) {
  assertNoUnknownKeys(body, 'body', ['status']);
  assertRequiredKeys(body, 'body', ['status']);
  assertOptionalString(body.status, 'body.status');
  if (!ORDER_STATUSES.has(body.status)) {
    throw new RequestValidationError('body.status is not allowed');
  }
}

function validateOrderVcBody(body) {
  assertNoUnknownKeys(body, 'body', ['vcCid', 'vcHash']);
  assertRequiredKeys(body, 'body', ['vcCid']);
  assertOptionalString(body.vcCid, 'body.vcCid');
  assertOptionalBytes32(body.vcHash, 'body.vcHash');
}

function validateOrderAttestationBody(body) {
  validateOrderAttestation(body, 'body');
}

function validateProofBundlePatchBody(body) {
  assertNoUnknownKeys(body, 'body', [
    'encryptedQuantityOpening',
    'encryptedTotalOpening',
    'quantityTotalProof',
    'paymentEqualityProof',
    'proofBundle',
  ]);
  assertOptionalJsonLike(body.encryptedQuantityOpening, 'body.encryptedQuantityOpening');
  assertOptionalJsonLike(body.encryptedTotalOpening, 'body.encryptedTotalOpening');
  assertOptionalObjectLike(body.quantityTotalProof, 'body.quantityTotalProof');
  assertOptionalObjectLike(body.paymentEqualityProof, 'body.paymentEqualityProof');
  assertOptionalObjectLike(body.proofBundle, 'body.proofBundle');
}

function validateVcArchiveBody(body) {
  assertNoUnknownKeys(body, 'body', ['cid', 'vc', 'source']);
  assertRequiredKeys(body, 'body', ['cid', 'vc']);
  assertOptionalString(body.cid, 'body.cid');
  assertPlainObject(body.vc, 'body.vc');
  assertOptionalString(body.source, 'body.source');
}

function validateVcStatusPatchBody(body) {
  assertNoUnknownKeys(body, 'body', ['status', 'reason', 'revokedAt']);
  assertRequiredKeys(body, 'body', ['status']);
  assertOptionalString(body.status, 'body.status');
  if (!VC_STATUS_VALUES.has(body.status)) {
    throw new RequestValidationError('body.status is not allowed');
  }
  assertOptionalString(body.reason, 'body.reason');
  assertOptionalString(body.revokedAt, 'body.revokedAt');
}

module.exports = {
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
};
