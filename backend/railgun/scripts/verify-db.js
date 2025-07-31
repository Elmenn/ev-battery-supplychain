const { getDatabase } = require('../database/connection');

async function verifyDatabase() {
    console.log('🔍 Verifying Database Setup...\n');
    
    try {
        const db = await getDatabase();
        
        // Test 1: Check tables exist
        console.log('📋 Test 1: Checking tables...');
        const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        console.log('✅ Tables found:', tables.map(t => t.name).join(', '));
        
        // Test 2: Check config values
        console.log('\n📋 Test 2: Checking config...');
        const auditorAddress = await db.getConfig('auditor_address');
        const dustAmount = await db.getConfig('dust_amount');
        const batchSchedule = await db.getConfig('batch_schedule');
        const maxRetries = await db.getConfig('max_retries');
        
        console.log('✅ Config values:');
        console.log(`   - Auditor Address: ${auditorAddress}`);
        console.log(`   - Dust Amount: ${dustAmount}`);
        console.log(`   - Batch Schedule: ${batchSchedule}`);
        console.log(`   - Max Retries: ${maxRetries}`);
        
        // Test 3: Test idempotency
        console.log('\n📋 Test 3: Testing idempotency...');
        const testProductId = 123;
        const testVcHash = '0x1234567890abcdef';
        const testMemoHash = '0xabcdef1234567890';
        const testNonceHex = '0x1111111111111111111111111111111111111111111111111111111111111111';
        
        // First insert
        console.log('   - Inserting first receipt...');
        await db.storeReceipt(testProductId, testVcHash, testMemoHash, testNonceHex);
        console.log('   ✅ First insert successful');
        
        // Second insert (should fail due to UNIQUE constraint)
        console.log('   - Attempting duplicate insert...');
        try {
            await db.storeReceipt(testProductId, testVcHash, testMemoHash, testNonceHex);
            console.log('   ❌ Second insert should have failed');
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                console.log('   ✅ Duplicate insert correctly rejected (idempotent)');
            } else {
                console.log('   ❌ Unexpected error:', error.message);
            }
        }
        
        // Test 4: Check receipt was stored
        console.log('\n📋 Test 4: Verifying receipt storage...');
        const receipt = await db.getReceipt(testMemoHash);
        if (receipt) {
            console.log('✅ Receipt found:');
            console.log(`   - Product ID: ${receipt.product_id}`);
            console.log(`   - VC Hash: ${receipt.vc_hash}`);
            console.log(`   - Memo Hash: ${receipt.memo_hash}`);
            console.log(`   - Nonce: ${receipt.nonce_hex}`);
        } else {
            console.log('❌ Receipt not found');
        }
        
        // Test 5: Test audit logging
        console.log('\n📋 Test 5: Testing audit logging...');
        await db.logAuditEvent('test_verification', testProductId, testMemoHash, {
            test: true,
            timestamp: new Date().toISOString()
        });
        console.log('✅ Audit event logged successfully');
        
        console.log('\n🎉 Database verification completed successfully!');
        
        await db.close();
        
    } catch (error) {
        console.error('❌ Database verification failed:', error);
        process.exit(1);
    }
}

// Run verification if called directly
if (require.main === module) {
    verifyDatabase();
}

module.exports = { verifyDatabase }; 