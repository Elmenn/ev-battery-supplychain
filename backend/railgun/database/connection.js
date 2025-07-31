const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class Database {
    constructor(dbPath = null) {
        this.dbPath = dbPath || path.join(__dirname, '../data/railgun-integration.db');
        this.db = null;
    }

    async connect() {
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            this.db = new BetterSqlite3(this.dbPath);
            console.log('✅ Connected to SQLite database:', this.dbPath);
        } catch (err) {
            console.error('❌ Database connection error:', err);
            throw err;
        }
    }

    async initialize() {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        try {
            this.db.exec(schema);
            console.log('✅ Database schema initialized');
        } catch (err) {
            console.error('❌ Schema initialization error:', err);
            throw err;
        }
    }

    async close() {
        if (this.db) {
            try {
                this.db.close();
                console.log('✅ Database connection closed');
            } catch (err) {
                console.error('❌ Database close error:', err);
            }
        }
    }

    // Receipt operations
    async storeReceipt(productId, vcHash, memoHash, nonceHex, railgunTxRef = null) {
        const sql = `
            INSERT INTO receipts (product_id, vc_hash, memo_hash, nonce_hex, railgun_tx_ref)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.run(productId, vcHash, memoHash, nonceHex, railgunTxRef);
            console.log('✅ Receipt stored with ID:', result.lastInsertRowid);
            return result.lastInsertRowid;
        } catch (err) {
            // Handle UNIQUE constraint violation as success (idempotency)
            if (err.message.includes('UNIQUE constraint failed')) {
                console.log('✅ Receipt already exists (idempotent)');
                return 'already_exists';
            } else {
                console.error('❌ Store receipt error:', err);
                throw err;
            }
        }
    }

    async updateReceiptTxRef(memoHash, railgunTxRef) {
        const sql = `
            UPDATE receipts 
            SET railgun_tx_ref = ?, updated_at = CURRENT_TIMESTAMP
            WHERE memo_hash = ?
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.run(railgunTxRef, memoHash);
            console.log('✅ Receipt updated, rows affected:', result.changes);
            return result.changes;
        } catch (err) {
            console.error('❌ Update receipt error:', err);
            throw err;
        }
    }

    async getReceipt(memoHash) {
        const sql = `
            SELECT * FROM receipts WHERE memo_hash = ?
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            const row = stmt.get(memoHash);
            return row;
        } catch (err) {
            console.error('❌ Get receipt error:', err);
            throw err;
        }
    }

    async getReceiptsByProduct(productId) {
        const sql = `
            SELECT * FROM receipts WHERE product_id = ? ORDER BY created_at DESC
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            const rows = stmt.all(productId);
            return rows;
        } catch (err) {
            console.error('❌ Get receipts error:', err);
            throw err;
        }
    }

    // Pending payments operations
    async storePendingPayment(productId, memoHash, railgunTxRef, errorMessage) {
        const sql = `
            INSERT INTO pending_payments (product_id, memo_hash, railgun_tx_ref, error_message)
            VALUES (?, ?, ?, ?)
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.run(productId, memoHash, railgunTxRef, errorMessage);
            console.log('✅ Pending payment stored with ID:', result.lastInsertRowid);
            return result.lastInsertRowid;
        } catch (err) {
            console.error('❌ Store pending payment error:', err);
            throw err;
        }
    }

    async getPendingPayments() {
        const sql = `
            SELECT * FROM pending_payments 
            WHERE status = 'pending' AND retry_count < max_retries
            ORDER BY created_at ASC
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            const rows = stmt.all();
            return rows;
        } catch (err) {
            console.error('❌ Get pending payments error:', err);
            throw err;
        }
    }

    async updatePendingPaymentStatus(id, status, errorMessage = null) {
        const sql = `
            UPDATE pending_payments 
            SET status = ?, error_message = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.run(status, errorMessage, id);
            console.log('✅ Pending payment updated, rows affected:', result.changes);
            return result.changes;
        } catch (err) {
            console.error('❌ Update pending payment error:', err);
            throw err;
        }
    }

    // Audit log operations
    async logAuditEvent(operation, productId, memoHash, details) {
        const sql = `
            INSERT INTO audit_log (operation, product_id, memo_hash, details)
            VALUES (?, ?, ?, ?)
        `;
        
        const detailsJson = JSON.stringify(details);
        
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.run(operation, productId, memoHash, detailsJson);
            console.log('✅ Audit event logged with ID:', result.lastInsertRowid);
            return result.lastInsertRowid;
        } catch (err) {
            console.error('❌ Log audit event error:', err);
            throw err;
        }
    }

    // Configuration operations
    async getConfig(key) {
        const sql = `SELECT value FROM config WHERE key = ?`;
        
        try {
            const stmt = this.db.prepare(sql);
            const row = stmt.get(key);
            return row ? row.value : null;
        } catch (err) {
            console.error('❌ Get config error:', err);
            throw err;
        }
    }

    async setConfig(key, value) {
        const sql = `
            INSERT OR REPLACE INTO config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            stmt.run(key, value);
            console.log('✅ Config updated:', key);
        } catch (err) {
            console.error('❌ Set config error:', err);
            throw err;
        }
    }
}

// Singleton instance
let dbInstance = null;

const getDatabase = async () => {
    if (!dbInstance) {
        dbInstance = new Database();
        await dbInstance.connect();
        await dbInstance.initialize();
    }
    return dbInstance;
};

module.exports = { Database, getDatabase }; 