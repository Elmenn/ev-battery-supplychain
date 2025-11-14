-- EV Battery Marketplace - Railgun Integration Database Schema (Wallet Mode)
-- SQLite for development, PostgreSQL for production

-- Configuration table for storing pending receipts and idempotency keys
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit history table for logging operations (optional, for debugging)
CREATE TABLE IF NOT EXISTS audit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL,
    user_address TEXT,
    railgun_address TEXT,
    details TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration
INSERT OR REPLACE INTO config (key, value) VALUES
('auditor_address', '0zk...'), -- Will be filled by script
('batch_schedule', '12h'),
('dust_amount', '0.01'),
('max_retries', '3'); 