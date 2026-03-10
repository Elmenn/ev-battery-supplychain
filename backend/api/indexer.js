const { Contract, Interface, JsonRpcProvider, ZeroHash, isAddress, getAddress } = require('ethers');
const db = require('./db');

const FACTORY_EVENT_FRAGMENTS = [
  'event ProductCreatedV2(address indexed product, address indexed seller, uint256 indexed productId, bytes32 priceCommitment, bytes32 unitPriceHash, uint256 bondAmount)',
];

const ESCROW_EVENT_FRAGMENTS = [
  'event OrderPaymentRecorded(bytes32 indexed orderId, uint256 indexed productId, address indexed buyer, bytes32 memoHash, bytes32 railgunTxRef, bytes32 quantityCommitment, bytes32 totalCommitment, bytes32 paymentCommitment, bytes32 contextHash, uint256 timestamp)',
  'event OrderConfirmedById(bytes32 indexed orderId, uint256 indexed productId, address indexed buyer, bytes32 vcHash, string vcCID, uint256 timestamp)',
  'event TransporterSelected(uint256 indexed productId, address indexed transporter, uint256 timestamp)',
  'event DeliveryConfirmed(address indexed buyer, address indexed transporter, address indexed seller, uint256 productId, bytes32 priceCommitment, uint256 timestamp)',
  'event SellerTimeoutEvent(address indexed caller, uint256 indexed productId, uint256 time, uint256 timestamp)',
  'event DeliveryTimeoutEvent(address indexed caller, uint256 indexed productId, uint256 time, uint256 timestamp)',
  'event PhaseChanged(uint256 indexed productId, uint8 indexed from, uint8 indexed to, address actor, uint256 timestamp, bytes32 ref)',
];

const ESCROW_VIEW_FRAGMENTS = [
  'function id() view returns (uint256)',
  'function owner() view returns (address payable)',
  'function phase() view returns (uint8)',
  'function buyer() view returns (address payable)',
  'function transporter() view returns (address payable)',
  'function unitPriceHash() view returns (bytes32)',
  'function activeOrderId() view returns (bytes32)',
  'function getOrder(bytes32 orderId) view returns ((address buyer, bytes32 memoHash, bytes32 railgunTxRef, bytes32 quantityCommitment, bytes32 totalCommitment, bytes32 paymentCommitment, bytes32 contextHash, bytes32 vcHash, uint64 purchaseTimestamp, uint64 orderConfirmedTimestamp, uint8 phase, bool exists))',
  'function getVcHash() view returns (bytes32)',
];

const factoryInterface = new Interface(FACTORY_EVENT_FRAGMENTS);
const escrowEventInterface = new Interface(ESCROW_EVENT_FRAGMENTS);

const stmtGetIndexerState = db.prepare('SELECT state_value FROM indexer_state WHERE state_key = ?');
const stmtUpsertIndexerState = db.prepare(`
  INSERT INTO indexer_state (state_key, state_value, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(state_key) DO UPDATE SET
    state_value = excluded.state_value,
    updated_at = datetime('now')
`);

const stmtUpsertIndexedProduct = db.prepare(`
  INSERT INTO indexed_products (
    product_address,
    seller_address,
    product_id,
    chain_id,
    unit_price_hash,
    source,
    last_seen_block,
    last_indexed_block,
    updated_at
  ) VALUES (
    @productAddress,
    @sellerAddress,
    @productId,
    @chainId,
    @unitPriceHash,
    @source,
    @lastSeenBlock,
    @lastIndexedBlock,
    datetime('now')
  )
  ON CONFLICT(product_address) DO UPDATE SET
    seller_address = COALESCE(excluded.seller_address, indexed_products.seller_address),
    product_id = COALESCE(excluded.product_id, indexed_products.product_id),
    chain_id = COALESCE(excluded.chain_id, indexed_products.chain_id),
    unit_price_hash = COALESCE(excluded.unit_price_hash, indexed_products.unit_price_hash),
    source = COALESCE(excluded.source, indexed_products.source),
    last_seen_block = CASE
      WHEN excluded.last_seen_block > indexed_products.last_seen_block THEN excluded.last_seen_block
      ELSE indexed_products.last_seen_block
    END,
    last_indexed_block = CASE
      WHEN excluded.last_indexed_block > indexed_products.last_indexed_block THEN excluded.last_indexed_block
      ELSE indexed_products.last_indexed_block
    END,
    updated_at = datetime('now')
`);

const stmtGetTrackedProducts = db.prepare(`
  SELECT product_address, seller_address, product_id, chain_id, unit_price_hash, source, last_seen_block, last_indexed_block
  FROM indexed_products
  ORDER BY product_address ASC
`);

const stmtGetTrackedProductsNeedingSync = db.prepare(`
  SELECT product_address, seller_address, product_id, chain_id, unit_price_hash, source, last_seen_block, last_indexed_block
  FROM indexed_products
  WHERE last_indexed_block < ?
  ORDER BY last_indexed_block ASC, product_address ASC
`);

const stmtGetMetadataRow = db.prepare('SELECT * FROM product_metadata WHERE product_address = ?');
const stmtGetMetadataAddresses = db.prepare('SELECT product_address FROM product_metadata');
const stmtGetOrderRow = db.prepare('SELECT * FROM product_orders WHERE order_id = ?');
const stmtGetLatestOrderByProduct = db.prepare(`
  SELECT * FROM product_orders
  WHERE product_address = ?
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1
`);

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
    quantity_proof = COALESCE(excluded.quantity_proof, product_orders.quantity_proof),
    total_commitment = excluded.total_commitment,
    total_proof = COALESCE(excluded.total_proof, product_orders.total_proof),
    payment_commitment = excluded.payment_commitment,
    payment_proof = COALESCE(excluded.payment_proof, product_orders.payment_proof),
    context_hash = excluded.context_hash,
    order_vc_cid = COALESCE(excluded.order_vc_cid, product_orders.order_vc_cid),
    order_vc_hash = COALESCE(excluded.order_vc_hash, product_orders.order_vc_hash),
    updated_at = datetime('now')
`);

const stmtUpdateMetadataVcCid = db.prepare(
  "UPDATE product_metadata SET vc_cid = ?, updated_at = datetime('now') WHERE product_address = ?"
);

const stmtHealthTrackedProducts = db.prepare('SELECT COUNT(*) AS count FROM indexed_products');
const stmtHealthOrdersMissingAttestation = db.prepare(`
  SELECT COUNT(*) AS count
  FROM product_orders o
  LEFT JOIN order_private_attestations a ON a.order_id = o.order_id
  WHERE o.status IN ('payment_pending_recording', 'payment_recorded', 'order_confirmed', 'bound', 'delivered', 'expired')
    AND a.order_id IS NULL
`);
const stmtHealthTrackedMissingMetadata = db.prepare(`
  SELECT COUNT(*) AS count
  FROM indexed_products p
  LEFT JOIN product_metadata m ON m.product_address = p.product_address
  WHERE m.product_address IS NULL
`);
const stmtHealthTrackedIncompatible = db.prepare(`
  SELECT COUNT(*) AS count
  FROM indexed_products
  WHERE source IN ('metadata-incompatible', 'chain-incompatible')
`);

function getEnv(name, fallback = null) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function toLowerAddress(address) {
  return typeof address === 'string' ? address.toLowerCase() : address;
}

function normalizeTrackedAddress(address) {
  if (typeof address !== 'string' || address.trim().length === 0) {
    return null;
  }

  if (!isAddress(address)) {
    return null;
  }

  return getAddress(address).toLowerCase();
}

function mapPhaseToStatus(phase) {
  const normalized = Number(phase);
  if (normalized === 1) return 'payment_recorded';
  if (normalized === 2) return 'order_confirmed';
  if (normalized === 3) return 'bound';
  if (normalized === 4) return 'delivered';
  if (normalized === 5) return 'expired';
  return 'payment_pending_recording';
}

function isRecoverableSnapshotError(error) {
  const code = error?.code || null;
  return code === 'BAD_DATA' || code === 'CALL_EXCEPTION' || code === 'UNSUPPORTED_OPERATION';
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

class BackendIndexer {
  constructor() {
    this.enabled = false;
    this.running = false;
    this.started = false;
    this.timer = null;
    this.pollInFlight = false;
    this.lastError = null;
    this.lastPollStartedAt = null;
    this.lastPollCompletedAt = null;
    this.lastPollDurationMs = null;
    this.provider = null;
    this.chainId = null;
    this.factoryAddress = null;
    this.pollIntervalMs = Number(getEnv('INDEXER_POLL_INTERVAL_MS', '15000'));
    this.factoryStartBlock = Number(getEnv('INDEXER_START_BLOCK', '0'));
    this.batchSize = Number(getEnv('INDEXER_BATCH_SIZE', '1000'));
  }

  configure() {
    const rpcUrl = getEnv(
      'INDEXER_RPC_URL',
      getEnv('VC_DID_RPC_URL', getEnv('RPC_URL', getEnv('REACT_APP_RPC_URL')))
    );
    const factoryAddress = getEnv(
      'INDEXER_FACTORY_ADDRESS',
      getEnv('FACTORY_ADDRESS', getEnv('REACT_APP_FACTORY_ADDRESS'))
    );
    this.enabled = Boolean(rpcUrl && factoryAddress);

    if (!this.enabled) {
      return;
    }

    if (!this.provider) {
      this.provider = new JsonRpcProvider(rpcUrl);
    }
    this.factoryAddress = factoryAddress.toLowerCase();
  }

  async start() {
    if (this.started) {
      return this.getStatus();
    }

    this.configure();
    if (!this.enabled) {
      this.started = true;
      return this.getStatus();
    }

    this.chainId = Number((await this.provider.getNetwork()).chainId);
    this.started = true;
    this.running = true;

    await this.bootstrapTrackedProductsFromMetadata();
    await this.pollOnce();
    this.scheduleNextPoll();
    return this.getStatus();
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  scheduleNextPoll() {
    if (!this.running || !this.enabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.pollOnce()
        .catch((error) => {
          this.lastError = error.message || String(error);
          console.error('[indexer] poll failed:', error);
        })
        .finally(() => this.scheduleNextPoll());
    }, this.pollIntervalMs);
  }

  getFactoryCursor() {
    const row = stmtGetIndexerState.get('factory_last_indexed_block');
    if (!row) return this.factoryStartBlock;
    const parsed = Number(row.state_value);
    return Number.isFinite(parsed) ? parsed : this.factoryStartBlock;
  }

  setFactoryCursor(blockNumber) {
    stmtUpsertIndexerState.run('factory_last_indexed_block', String(blockNumber));
  }

  setIndexerState(key, value) {
    stmtUpsertIndexerState.run(key, value == null ? null : String(value));
  }

  getIndexerState(key) {
    const row = stmtGetIndexerState.get(key);
    return row?.state_value ?? null;
  }

  async bootstrapTrackedProductsFromMetadata() {
    const rows = stmtGetMetadataAddresses.all();
    for (const row of rows) {
      const productAddress = normalizeTrackedAddress(row.product_address);
      if (!productAddress) {
        continue;
      }

      stmtUpsertIndexedProduct.run({
        productAddress,
        sellerAddress: null,
        productId: null,
        chainId: this.chainId ? String(this.chainId) : null,
        unitPriceHash: null,
        source: 'metadata',
        lastSeenBlock: 0,
        lastIndexedBlock: 0,
      });
    }
  }

  async pollOnce() {
    if (!this.enabled || this.pollInFlight) return;
    this.pollInFlight = true;
    this.lastPollStartedAt = new Date().toISOString();
    const startedAt = Date.now();
    this.lastError = null;

    try {
      const latestBlock = await this.provider.getBlockNumber();
      await this.syncFactoryProducts(latestBlock);
      await this.syncTrackedProducts(latestBlock);
      this.lastError = null;
      this.setIndexerState('last_polled_block', String(latestBlock));
      this.setIndexerState('last_poll_completed_at', new Date().toISOString());
      this.setIndexerState('last_poll_error', null);
      this.lastPollCompletedAt = new Date().toISOString();
      this.lastPollDurationMs = Date.now() - startedAt;
    } catch (error) {
      this.lastError = error.message || String(error);
      this.setIndexerState('last_poll_error', this.lastError);
      throw error;
    } finally {
      this.pollInFlight = false;
    }
  }

  async syncFactoryProducts(latestBlock) {
    let cursor = this.getFactoryCursor();
    while (cursor < latestBlock) {
      const fromBlock = cursor + 1;
      const toBlock = Math.min(latestBlock, cursor + this.batchSize);
      const logs = await this.provider.getLogs({
        address: this.factoryAddress,
        fromBlock,
        toBlock,
        topics: [factoryInterface.getEvent('ProductCreatedV2').topicHash],
      });

      for (const log of logs) {
        const parsed = factoryInterface.parseLog(log);
        stmtUpsertIndexedProduct.run({
          productAddress: toLowerAddress(parsed.args.product),
          sellerAddress: toLowerAddress(parsed.args.seller),
          productId: String(parsed.args.productId),
          chainId: String(this.chainId),
          unitPriceHash: String(parsed.args.unitPriceHash).toLowerCase(),
          source: 'factory',
          lastSeenBlock: Number(log.blockNumber),
          lastIndexedBlock: 0,
        });
      }

      cursor = toBlock;
      this.setFactoryCursor(cursor);
    }
  }

  async syncTrackedProducts(latestBlock) {
    const trackedProducts = stmtGetTrackedProductsNeedingSync
      .all(latestBlock)
      .map((row) => ({
        ...row,
        product_address: normalizeTrackedAddress(row.product_address),
      }))
      .filter((row) => row.product_address);
    if (trackedProducts.length === 0) return;

    const groups = chunk(trackedProducts, 50);
    const interestingTopics = ESCROW_EVENT_FRAGMENTS.map((fragment) => escrowEventInterface.getEvent(fragment).topicHash);

    for (const group of groups) {
      const addresses = group.map((row) => row.product_address);
      const productsToRefresh = new Set(
        group.filter((row) => Number(row.last_indexed_block || 0) === 0).map((row) => row.product_address)
      );

      const indexedRows = group.filter((row) => Number(row.last_indexed_block || 0) > 0);
      if (indexedRows.length > 0) {
        let fromBlock = Math.max(
          this.factoryStartBlock,
          Math.min(...indexedRows.map((row) => Number(row.last_indexed_block || 0) + 1))
        );

        while (fromBlock <= latestBlock) {
          const toBlock = Math.min(latestBlock, fromBlock + this.batchSize - 1);
          const logs = await this.provider.getLogs({
            address: addresses,
            fromBlock,
            toBlock,
            topics: [interestingTopics],
          });

          for (const log of logs) {
            productsToRefresh.add(log.address.toLowerCase());
          }

          fromBlock = toBlock + 1;
        }
      }

      for (const row of group) {
        if (productsToRefresh.has(row.product_address)) {
          await this.refreshProductSnapshot(row.product_address, latestBlock);
        } else {
          stmtUpsertIndexedProduct.run({
            productAddress: row.product_address,
            sellerAddress: row.seller_address,
            productId: row.product_id,
            chainId: row.chain_id,
            unitPriceHash: row.unit_price_hash,
            source: row.source,
            lastSeenBlock: row.last_seen_block || 0,
            lastIndexedBlock: latestBlock,
          });
        }
      }
    }
  }

  async refreshProductSnapshot(productAddress, latestBlock) {
    const normalizedProductAddress = normalizeTrackedAddress(productAddress);
    if (!normalizedProductAddress) {
      return;
    }

    const metadataRow = stmtGetMetadataRow.get(normalizedProductAddress);
    const existingOrderRow = stmtGetLatestOrderByProduct.get(normalizedProductAddress);

    const contract = new Contract(
      normalizedProductAddress,
      [...ESCROW_VIEW_FRAGMENTS, ...ESCROW_EVENT_FRAGMENTS],
      this.provider
    );

    let productId;
    let owner;
    let phase;
    let buyer;
    let transporter;
    let unitPriceHash;
    let activeOrderId;
    let vcHash;

    try {
      [productId, owner, phase, buyer, transporter, unitPriceHash, activeOrderId, vcHash] = await Promise.all([
        contract.id(),
        contract.owner(),
        contract.phase(),
        contract.buyer(),
        contract.transporter(),
        contract.unitPriceHash().catch(() => ZeroHash),
        contract.activeOrderId().catch(() => ZeroHash),
        contract.getVcHash().catch(() => ZeroHash),
      ]);
    } catch (error) {
      if (!isRecoverableSnapshotError(error)) {
        throw error;
      }

      stmtUpsertIndexedProduct.run({
        productAddress: normalizedProductAddress,
        sellerAddress: metadataRow?.seller_address || null,
        productId: existingOrderRow?.product_id || null,
        chainId: String(this.chainId),
        unitPriceHash: metadataRow?.unit_price_hash || existingOrderRow?.unit_price_hash || null,
        source: metadataRow ? 'metadata-incompatible' : 'chain-incompatible',
        lastSeenBlock: latestBlock,
        lastIndexedBlock: latestBlock,
      });
      this.setIndexerState(
        `product:${normalizedProductAddress}:skip_reason`,
        error.shortMessage || error.message || 'incompatible contract'
      );
      return;
    }

    const unitPriceWei =
      metadataRow?.unit_price_wei ||
      existingOrderRow?.unit_price_wei ||
      metadataRow?.product_meta && JSON.parse(metadataRow.product_meta || '{}').unitPriceWei ||
      null;

    stmtUpsertIndexedProduct.run({
      productAddress: normalizedProductAddress,
      sellerAddress: toLowerAddress(owner),
      productId: String(productId),
      chainId: String(this.chainId),
      unitPriceHash: String(unitPriceHash || ZeroHash).toLowerCase(),
      source: metadataRow ? 'metadata+chain' : 'chain',
      lastSeenBlock: latestBlock,
      lastIndexedBlock: latestBlock,
    });

    if (activeOrderId && activeOrderId !== ZeroHash && unitPriceWei) {
      const order = await contract.getOrder(activeOrderId);
      if (order?.exists) {
        const existing = stmtGetOrderRow.get(String(activeOrderId).toLowerCase());
        stmtUpsertOrder.run({
          orderId: String(activeOrderId).toLowerCase(),
          productAddress: normalizedProductAddress,
          productId: String(productId),
          escrowAddress: normalizedProductAddress,
          chainId: String(this.chainId),
          sellerAddress: toLowerAddress(owner),
          buyerAddress: toLowerAddress(order.buyer || buyer),
          status: mapPhaseToStatus(order.phase ?? phase),
          memoHash: String(order.memoHash).toLowerCase(),
          railgunTxRef: String(order.railgunTxRef).toLowerCase(),
          unitPriceWei: String(unitPriceWei),
          unitPriceHash: String(unitPriceHash || ZeroHash).toLowerCase(),
          quantityCommitment: String(order.quantityCommitment).toLowerCase(),
          quantityProof: existing?.quantity_proof || null,
          totalCommitment: String(order.totalCommitment).toLowerCase(),
          totalProof: existing?.total_proof || null,
          paymentCommitment: String(order.paymentCommitment).toLowerCase(),
          paymentProof: existing?.payment_proof || null,
          contextHash: String(order.contextHash).toLowerCase(),
          orderVcCid: existing?.order_vc_cid || metadataRow?.vc_cid || null,
          orderVcHash: String(order.vcHash || vcHash || ZeroHash).toLowerCase(),
        });
      }
    }

    if (metadataRow?.product_address && vcHash && vcHash !== ZeroHash && !metadataRow.vc_cid) {
      const latestOrder = stmtGetLatestOrderByProduct.get(normalizedProductAddress);
      if (latestOrder?.order_vc_cid) {
        stmtUpdateMetadataVcCid.run(latestOrder.order_vc_cid, normalizedProductAddress);
      }
    }

    if (transporter && transporter !== '0x0000000000000000000000000000000000000000') {
      this.setIndexerState(`product:${normalizedProductAddress}:transporter`, transporter.toLowerCase());
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      running: this.running,
      started: this.started,
      chainId: this.chainId,
      factoryAddress: this.factoryAddress,
      pollIntervalMs: this.pollIntervalMs,
      batchSize: this.batchSize,
      factoryLastIndexedBlock: Number(this.getIndexerState('factory_last_indexed_block') || this.factoryStartBlock),
      lastPolledBlock: Number(this.getIndexerState('last_polled_block') || 0),
      lastPollStartedAt: this.lastPollStartedAt,
      lastPollCompletedAt: this.lastPollCompletedAt || this.getIndexerState('last_poll_completed_at'),
      lastPollDurationMs: this.lastPollDurationMs,
      lastError: this.lastError || this.getIndexerState('last_poll_error'),
      trackedProducts: stmtHealthTrackedProducts.get().count,
      ordersMissingAttestation: stmtHealthOrdersMissingAttestation.get().count,
      trackedProductsMissingMetadata: stmtHealthTrackedMissingMetadata.get().count,
      trackedProductsIncompatible: stmtHealthTrackedIncompatible.get().count,
    };
  }
}

const indexer = new BackendIndexer();

async function startIndexer() {
  return indexer.start();
}

function stopIndexer() {
  indexer.stop();
}

function getIndexerStatus() {
  return indexer.getStatus();
}

module.exports = {
  startIndexer,
  stopIndexer,
  getIndexerStatus,
  mapPhaseToStatus,
  chunk,
};
