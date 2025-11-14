// test-networkname-enum.js
// Test the NetworkName enum from shared-models

console.log('🌐 Testing NetworkName Enum...\n');

try {
  const sharedModels = require('@railgun-community/shared-models');
  
  console.log('✅ NetworkName enum found:');
  console.log('  Type:', typeof sharedModels.NetworkName);
  console.log('  Value:', sharedModels.NetworkName);
  
  if (typeof sharedModels.NetworkName === 'object') {
    console.log('\n🔍 NetworkName enum contents:');
    Object.entries(sharedModels.NetworkName).forEach(([key, value]) => {
      console.log(`  ${key}: ${value}`);
    });
  }
  
  console.log('\n🌐 Available Networks for SDK:');
  console.log('  Free Testnets (for building/testing):');
  console.log('    • Ethereum_Goerli (chainId: 5) - FREE');
  console.log('    • Ethereum_Sepolia (chainId: 11155111) - FREE');
  console.log('    • Polygon_Mumbai (chainId: 80001) - FREE');
  console.log('    • Arbitrum_Goerli (chainId: 421613) - FREE');
  console.log('    • Polygon_Amoy (chainId: 80002) - FREE');
  console.log('    • Hardhat (chainId: 31337) - LOCAL');
  
  console.log('\n  Mainnets (require real tokens):');
  console.log('    • Ethereum (chainId: 1) - Mainnet');
  console.log('    • BNB_Chain (chainId: 56) - BSC');
  console.log('    • Polygon (chainId: 137) - Polygon');
  console.log('    • Arbitrum (chainId: 42161) - Arbitrum');
  
  console.log('\n🎯 Recommended for Phase 1B Testing:');
  console.log('  • Ethereum_Sepolia - Most stable testnet');
  console.log('  • Polygon_Mumbai - Fast, cheap transactions');
  console.log('  • Hardhat - Local development (no real tokens needed)');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
}
