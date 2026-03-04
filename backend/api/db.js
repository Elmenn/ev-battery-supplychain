const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'metadata.sqlite');

// Ensure data directory exists before opening the database
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// WAL mode: better read concurrency, safe for single-writer Express server
db.pragma('journal_mode = WAL');

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

module.exports = db;
