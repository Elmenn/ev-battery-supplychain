const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'metadata.sqlite');

// Ensure data directory exists before opening the database
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL mode: better read concurrency, safe for single-writer Express server
db.pragma('journal_mode = WAL');

function hasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName, columnName, definition) {
  if (!hasColumn(tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS product_metadata (
    product_address   TEXT PRIMARY KEY NOT NULL,
    product_meta      TEXT,
    price_wei         TEXT,
    price_commitment  TEXT,
    seller_railgun_address TEXT,
    vc_cid            TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS buyer_secrets (
    product_address    TEXT NOT NULL,
    buyer_address      TEXT NOT NULL,
    encrypted_blob     TEXT NOT NULL,
    disclosure_pubkey  TEXT NOT NULL,
    c_pay              TEXT,
    c_pay_proof        TEXT,
    encrypted_opening  TEXT,
    equality_proof     TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (product_address, buyer_address)
  )
`);

ensureColumn('product_metadata', 'unit_price_wei', 'TEXT');
ensureColumn('product_metadata', 'unit_price_hash', 'TEXT');
ensureColumn('product_metadata', 'listing_snapshot_cid', 'TEXT');
ensureColumn('product_metadata', 'listing_snapshot_json', 'TEXT');
ensureColumn('product_metadata', 'listing_snapshot_sig', 'TEXT');
ensureColumn('product_metadata', 'schema_version', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS product_orders (
    order_id              TEXT PRIMARY KEY NOT NULL,
    product_address       TEXT NOT NULL,
    product_id            TEXT NOT NULL,
    escrow_address        TEXT NOT NULL,
    chain_id              TEXT NOT NULL,
    seller_address        TEXT NOT NULL,
    buyer_address         TEXT,
    status                TEXT NOT NULL,
    memo_hash             TEXT,
    railgun_tx_ref        TEXT,
    unit_price_wei        TEXT NOT NULL,
    unit_price_hash       TEXT NOT NULL,
    quantity_commitment   TEXT,
    quantity_proof        TEXT,
    total_commitment      TEXT,
    total_proof           TEXT,
    payment_commitment    TEXT,
    payment_proof         TEXT,
    disclosure_pubkey     TEXT,
    encrypted_blob        TEXT,
    encrypted_quantity_opening  TEXT,
    encrypted_total_opening     TEXT,
    quantity_total_proof_json   TEXT,
    payment_equality_proof_json TEXT,
    proof_bundle_json           TEXT,
    proof_embedded_in_vc  INTEGER NOT NULL DEFAULT 0,
    context_hash          TEXT NOT NULL,
    order_vc_cid          TEXT,
    order_vc_hash         TEXT,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

ensureColumn('product_orders', 'disclosure_pubkey', 'TEXT');
ensureColumn('product_orders', 'encrypted_blob', 'TEXT');
ensureColumn('product_orders', 'encrypted_quantity_opening', 'TEXT');
ensureColumn('product_orders', 'encrypted_total_opening', 'TEXT');
ensureColumn('product_orders', 'quantity_total_proof_json', 'TEXT');
ensureColumn('product_orders', 'payment_equality_proof_json', 'TEXT');
ensureColumn('product_orders', 'proof_bundle_json', 'TEXT');
ensureColumn('product_orders', 'proof_embedded_in_vc', 'INTEGER NOT NULL DEFAULT 0');

db.exec(`
  CREATE TABLE IF NOT EXISTS indexed_products (
    product_address     TEXT PRIMARY KEY NOT NULL,
    seller_address      TEXT,
    product_id          TEXT,
    chain_id            TEXT,
    unit_price_hash     TEXT,
    source              TEXT,
    last_seen_block     INTEGER NOT NULL DEFAULT 0,
    last_indexed_block  INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS indexer_state (
    state_key   TEXT PRIMARY KEY NOT NULL,
    state_value TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS vc_archives (
    cid               TEXT PRIMARY KEY NOT NULL,
    vc_json           TEXT NOT NULL,
    canonical_json    TEXT NOT NULL,
    vc_payload_hash   TEXT NOT NULL,
    product_address   TEXT,
    order_id          TEXT,
    source            TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS vc_status (
    cid               TEXT PRIMARY KEY NOT NULL,
    vc_payload_hash   TEXT,
    product_address   TEXT,
    order_id          TEXT,
    current_status    TEXT NOT NULL DEFAULT 'active',
    reason            TEXT,
    revoked_at        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

module.exports = db;
