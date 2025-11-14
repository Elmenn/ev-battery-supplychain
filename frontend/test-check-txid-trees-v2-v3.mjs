// test-check-txid-trees-v2-v3.mjs
import { getTXIDMerkletreeForNetwork } from '@railgun-community/wallet';
import { TXIDVersion, ChainType } from '@railgun-community/shared-models';

console.log('=== TESTING TXID TREES FOR SEPOLIA ===');
console.log('');

// Test V2 TXID Tree
console.log('Testing V2 TXID Tree...');
try {
  await getTXIDMerkletreeForNetwork(
    { type: ChainType.EVM, id: 11155111 }, // Sepolia
    TXIDVersion.V2_PoseidonMerkle
  );
  console.log('✅ V2 TXID tree exists (unexpected for Sepolia).');
} catch (e) {
  console.log('❌ No V2 TXID tree on Sepolia:', e.message);
}
console.log('');

// Test V3 TXID Tree
console.log('Testing V3 TXID Tree...');
try {
  await getTXIDMerkletreeForNetwork(
    { type: ChainType.EVM, id: 11155111 }, // Sepolia
    TXIDVersion.V3_PoseidonMerkle
  );
  console.log('✅ V3 TXID tree exists (unexpected for Sepolia).');
} catch (e) {
  console.log('❌ No V3 TXID tree on Sepolia:', e.message);
}
console.log('');

console.log('=== SUMMARY ===');
console.log('Both V2 and V3 TXID trees should fail on Sepolia');
console.log('This explains why your code uses V2_PoseidonMerkle but still gets TXID sync errors');



