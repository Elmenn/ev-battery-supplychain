const { generateAuditorWallet } = require('./generate-auditor-wallet');
const { getDatabase } = require('../database/connection');
const fs = require('fs');
const path = require('path');

async function setup() {
    console.log('🚀 Setting up Railgun Integration...\n');
    
    try {
        // Step 1: Generate auditor wallet
        console.log('📋 Step 1: Generating Auditor Wallet...');
        const auditorConfig = await generateAuditorWallet();
        
        // Step 2: Initialize database
        console.log('\n📋 Step 2: Initializing Database...');
        const db = await getDatabase();
        
        // Step 3: Store auditor address in database
        console.log('\n📋 Step 3: Configuring Database...');
        await db.setConfig('auditor_address', auditorConfig.railgunAddress);
        await db.setConfig('dust_amount', '0.01');
        await db.setConfig('batch_schedule', '12h');
        await db.setConfig('max_retries', '3');
        
        // Step 4: Log initial audit event
        await db.logAuditEvent('setup_completed', null, null, {
            auditorAddress: auditorConfig.railgunAddress,
            ethereumAddress: auditorConfig.ethereumAddress,
            setupTimestamp: new Date().toISOString()
        });
        
        // Step 5: Create .env template
        console.log('\n📋 Step 4: Creating Environment Template...');
        const envTemplate = `# Railgun Integration Environment Variables
# Copy this to .env and fill in your values

# Network Configuration
NETWORK=goerli
RPC_URL=https://goerli.infura.io/v3/YOUR_INFURA_KEY

# Railgun Configuration
RAILGUN_RELAYER_URL=https://relayer.railgun.org
RAILGUN_RELAYER_API_KEY=your_relayer_api_key

# Database Configuration
DB_PATH=./backend/railgun/data/railgun-integration.db

# Auditor Configuration
AUDITOR_ADDRESS=${auditorConfig.railgunAddress}
AUDITOR_VIEW_KEY=${auditorConfig.viewKey}

# Token Configuration
SETTLEMENT_TOKEN_ADDRESS=0x... # EURC address on Goerli
DUST_AMOUNT=0.01

# Batching Configuration
BATCH_SCHEDULE=12h
MAX_RETRIES=3

# Development Configuration
DEBUG=true
LOG_LEVEL=info
`;
        
        const envPath = path.join(__dirname, '../.env.template');
        fs.writeFileSync(envPath, envTemplate);
        
        console.log('✅ Setup completed successfully!\n');
        console.log('📁 Files created:');
        console.log(`   - backend/railgun/config/auditor-wallet.json`);
        console.log(`   - backend/railgun/data/railgun-integration.db`);
        console.log(`   - .env.railgun.template`);
        
        console.log('\n🔧 Next steps:');
        console.log('   1. Copy .env.railgun.template to .env and fill in your values');
        console.log('   2. Install dependencies: npm install');
        console.log('   3. Add recordPrivatePayment to your ProductEscrow contract');
        console.log('   4. Test shield/unshield with Railgun SDK');
        
        console.log('\n⚠️  Security Notes:');
        console.log('   - Store auditor spend key securely offline');
        console.log('   - Never commit .env file to version control');
        console.log('   - Rotate auditor keys periodically');
        
        await db.close();
        
    } catch (error) {
        console.error('❌ Setup failed:', error);
        process.exit(1);
    }
}

// Run setup if called directly
if (require.main === module) {
    setup();
}

module.exports = { setup }; 