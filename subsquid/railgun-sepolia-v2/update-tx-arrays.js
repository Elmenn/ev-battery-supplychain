// Update transaction arrays using TypeORM (should serialize correctly)
require('dotenv/config');
const { DataSource } = require('typeorm');
const { Transaction } = require('./lib/model/generated');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/squid';

const TARGET_TX_HASH = '0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';
const GRAPH_ID = '0x000000000000000000000000000000000000000000000000000000000091824000000000000000000000000000000000000000000000000000000000000000090000000000000000000000000000000000000000000000000000000000000000';

// Nullifier and commitment from check-events output
const nullifierHash = Buffer.from('05770a58f9a13f114598037826aafaf3c64e1e16f7689846624ebf5a74c68b4a', 'hex');
const commitmentHash = Buffer.from('fba45c7910ea10d2504bed7e397a8c12255d344392e7a745f1448a13210bca0c', 'hex');

async function update() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: DATABASE_URL,
    entities: [Transaction],
  });

  await dataSource.initialize();
  const repo = dataSource.getRepository(Transaction);

  try {
    const tx = await repo.findOne({ where: { id: GRAPH_ID } });
    
    if (!tx) {
      console.log('❌ Transaction not found');
      return;
    }

    console.log('📊 Current state:');
    console.log(`   nullifiers length: ${tx.nullifiers?.length || 0}`);
    console.log(`   commitments length: ${tx.commitments?.length || 0}`);

    // Update arrays
    tx.nullifiers = [nullifierHash];
    tx.commitments = [commitmentHash];

    await repo.save(tx);
    console.log('✅ Arrays updated!');
    console.log(`   nullifiers: ${tx.nullifiers.length} items`);
    console.log(`   commitments: ${tx.commitments.length} items`);

    // Verify
    const updated = await repo.findOne({ where: { id: GRAPH_ID } });
    console.log('\n📊 Verification:');
    console.log(`   nullifiers length: ${updated.nullifiers?.length || 0}`);
    console.log(`   commitments length: ${updated.commitments?.length || 0}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

update().catch(console.error);

