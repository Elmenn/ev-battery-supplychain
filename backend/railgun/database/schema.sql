-- EV Battery Marketplace - Railgun Integration Database Schema
-- SQLite for development, PostgreSQL for production

-- Receipts table for memo storage
CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Use SERIAL for PostgreSQL
    product_id INTEGER NOT NULL,
    vc_hash TEXT NOT NULL,
    memo_hash TEXT NOT NULL UNIQUE, -- Ensure uniqueness for idempotency
    railgun_tx_ref TEXT,
    nonce_hex TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for receipts table
CREATE INDEX IF NOT EXISTS idx_receipts_product_id ON receipts (product_id);
CREATE INDEX IF NOT EXISTS idx_receipts_memo_hash ON receipts (memo_hash);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts (created_at);
CREATE INDEX IF NOT EXISTS idx_receipts_vc_hash ON receipts (vc_hash);

-- Pending payments for retry logic
CREATE TABLE IF NOT EXISTS pending_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    memo_hash TEXT NOT NULL,
    railgun_tx_ref TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for pending_payments table
CREATE INDEX IF NOT EXISTS idx_pending_payments_status ON pending_payments (status);
CREATE INDEX IF NOT EXISTS idx_pending_payments_retry_count ON pending_payments (retry_count);

-- Audit log for tracking operations
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation TEXT NOT NULL, -- 'memo_created', 'payment_recorded', 'verification_attempt'
    product_id INTEGER,
    memo_hash TEXT,
    details TEXT, -- JSON string with operation details
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit_log table
CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON audit_log (operation);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at);

-- Configuration table
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default configuration
INSERT OR REPLACE INTO config (key, value) VALUES
('auditor_address', '0zk...'), -- Will be filled by script
('batch_schedule', '12h'),
('dust_amount', '0.01'),
('max_retries', '3');

-- Views for common queries
CREATE VIEW IF NOT EXISTS payment_summary AS
SELECT 
    product_id,
    vc_hash,
    memo_hash,
    railgun_tx_ref,
    created_at,
    CASE 
        WHEN railgun_tx_ref IS NOT NULL THEN 'completed'
        ELSE 'pending'
    END as status
FROM receipts
ORDER BY created_at DESC;

-- Helper function to update timestamps (PostgreSQL version)
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = CURRENT_TIMESTAMP;
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- Triggers for automatic timestamp updates (PostgreSQL)
-- CREATE TRIGGER update_receipts_updated_at BEFORE UPDATE ON receipts
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_pending_payments_updated_at BEFORE UPDATE ON pending_payments
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 