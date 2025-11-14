// Manually insert target transaction with populated arrays
require('dotenv/config');
const { DataSource } = require('typeorm');
const { Transaction, Nullifier, Commitment } = require('./lib/model');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5433/squid';

const TARGET_TX_HASH = '0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';
const BLOCK_NUMBER = 9536064;
const BLOCK_TIMESTAMP = 1716309480; // Approximate, adjust if needed
const TX_INDEX = 9;

// GraphQL ID format: 0x + blockNumber (64 hex) + position (64 hex) + zeros (64 hex)
const blockHex = BigInt(BLOCK_NUMBER).toString(16).padStart(64, '0');
const positionHex = BigInt(TX_INDEX).toString(16).padStart(64, '0');
const zeros = '0'.repeat(64);
const graphID = `0x${blockHex}${positionHex}${zeros}`;

// Nullifier and commitment from check-events output
const nullifierHash = Buffer.from('05770a58f9a13f114598037826aafaf3c64e1e16f7689846624ebf5a74c68b4a', 'hex');
const commitmentHash = Buffer.from('fba45c7910ea10d2504bed7e397a8c12255d344392e7a745f1448a13210bca0c', 'hex');

const txHash = Buffer.from(TARGET_TX_HASH.slice(2), 'hex');
const zeroHash = Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');

async function insert() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: DATABASE_URL,
    entities: [Transaction, Nullifier, Commitment],
  });

  await dataSource.initialize();
  const repo = dataSource.getRepository(Transaction);
  const nullifierRepo = dataSource.getRepository(Nullifier);
  const commitmentRepo = dataSource.getRepository(Commitment);

  try {
    // Check if exists
    const existing = await repo.findOne({ where: { id: graphID } });
    if (existing) {
      console.log('⚠️  Transaction already exists, deleting...');
      await repo.remove(existing);
    }

    // Insert transaction
    const transaction = repo.create({
      id: graphID,
      transactionHash: txHash,
      nullifiers: [nullifierHash],
      commitments: [commitmentHash],
      boundParamsHash: zeroHash,
      blockNumber: BigInt(BLOCK_NUMBER),
      blockTimestamp: BigInt(BLOCK_TIMESTAMP),
      utxoTreeIn: 0n,
      utxoTreeOut: 0n,
      utxoBatchStartPositionOut: 0n,
      hasUnshield: false,
      unshieldToAddress: null,
      unshieldValue: null,
      verificationHash: zeroHash,
    });

    await repo.save(transaction);
    console.log('✅ Transaction inserted:', graphID);

    // Insert nullifier
    const nullifier = nullifierRepo.create({
      id: `${TARGET_TX_HASH.toLowerCase()}-nullifier-0-0`,
      transactionHash: txHash,
      nullifier: nullifierHash,
      blockNumber: BigInt(BLOCK_NUMBER),
      blockTimestamp: BigInt(BLOCK_TIMESTAMP),
      treeNumber: 0,
    });
    await nullifierRepo.save(nullifier);
    console.log('✅ Nullifier inserted');

    // Insert commitment
    const commitment = commitmentRepo.create({
      id: `${TARGET_TX_HASH.toLowerCase()}-commitment-0-0`,
      transactionHash: txHash,
      commitmentType: 'ShieldCommitment',
      hash: commitmentHash,
      treeNumber: 0,
      batchStartTreePosition: 0,
      treePosition: 0,
      blockNumber: BigInt(BLOCK_NUMBER),
      blockTimestamp: BigInt(BLOCK_TIMESTAMP),
    });
    await commitmentRepo.save(commitment);
    console.log('✅ Commitment inserted');

    console.log('\n✅ All done! Transaction should now have populated arrays.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await dataSource.destroy();
  }
}

insert().catch(console.error);




