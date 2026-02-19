const BetterSqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

    // Configuration operations (used by current system)
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

    async deleteConfig(key) {
        const sql = `DELETE FROM config WHERE key = ?`;
        
        try {
            const stmt = this.db.prepare(sql);
            const result = stmt.run(key);
            console.log('✅ Config deleted:', key, 'rows affected:', result.changes);
            return result.changes;
        } catch (err) {
            console.error('❌ Delete config error:', err);
            throw err;
        }
    }

    // Get all configs (used for debugging)
    async getAllConfigs() {
        const sql = `SELECT key, value FROM config ORDER BY key`;
        
        try {
            const stmt = this.db.prepare(sql);
            const rows = stmt.all();
            return rows.map(row => [row.key, row.value]);
        } catch (err) {
            console.error('❌ Get all configs error:', err);
            throw err;
        }
    }

    // Audit logging for operations (used by current system)
    async logAuditEvent(operation, userAddress, railgunAddress, details) {
        const sql = `
            INSERT INTO audit_history (operation, user_address, railgun_address, details)
            VALUES (?, ?, ?, ?)
        `;
        
        try {
            const stmt = this.db.prepare(sql);
            const detailsJson = typeof details === 'object' ? JSON.stringify(details) : details;
            stmt.run(operation, userAddress, railgunAddress, detailsJson);
            console.log('✅ Audit logged:', operation);
        } catch (err) {
            console.error('❌ Audit logging error:', err);
            // Don't throw - audit logging failure shouldn't break main operations
        }
    }

    // Store a receipt for a private payment (simple implementation for wallet-mode)
    // Returns a generated receiptId
    async storeReceipt(productId, memoHash, memo, escrowAddress, railgunTxRef) {
        try {
            const id = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
            const key = `receipt_${id}`;
            const payload = {
                id,
                productId: String(productId),
                memoHash,
                memo,
                escrowAddress,
                railgunTxRef,
                createdAt: new Date().toISOString()
            };
            await this.setConfig(key, JSON.stringify(payload));
            return id;
        } catch (err) {
            console.error('❌ storeReceipt error:', err);
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