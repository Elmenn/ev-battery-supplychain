const { TXIDVersion, NetworkName } = require('@railgun-community/shared-models');

console.log('🔍 TXIDVersion constants:');
console.log('  - TXIDVersion.V2_PoseidonMerkle:', TXIDVersion.V2_PoseidonMerkle);
console.log('  - typeof TXIDVersion.V2_PoseidonMerkle:', typeof TXIDVersion.V2_PoseidonMerkle);
console.log('  - TXIDVersion.V3_PoseidonMerkle:', TXIDVersion.V3_PoseidonMerkle);
console.log('  - typeof TXIDVersion.V3_PoseidonMerkle:', typeof TXIDVersion.V3_PoseidonMerkle);

console.log('\n🔍 NetworkName constants:');
console.log('  - NetworkName.EthereumSepolia:', NetworkName.EthereumSepolia);
console.log('  - typeof NetworkName.EthereumSepolia:', typeof NetworkName.EthereumSepolia);

console.log('\n🔍 Testing numeric values:');
console.log('  - Number 2:', 2, 'type:', typeof 2);
console.log('  - Number 3:', 3, 'type:', typeof 3);

// Test if the SDK functions expect numeric values
console.log('\n🔍 SDK function parameter test:');
try {
  // Import the actual SDK functions to test their signatures
  const { gasEstimateForShield } = require('@railgun-community/wallet');
  
  console.log('  - gasEstimateForShield function:', typeof gasEstimateForShield);
  console.log('  - gasEstimateForShield.toString():', gasEstimateForShield.toString().substring(0, 100));
  
  // Test what happens when we call with different txidVersion types
  console.log('\n🔍 Testing parameter validation:');
  
  // This should help us understand what the SDK expects
  console.log('  - Ready to test SDK calls...');
  
} catch (error) {
  console.log('  - Error importing SDK:', error.message);
}
