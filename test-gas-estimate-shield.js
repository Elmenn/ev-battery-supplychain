const { gasEstimateForShield } = require('@railgun-community/wallet');
const { TXIDVersion, NetworkName } = require('@railgun-community/shared-models');

console.log('🔍 Testing gasEstimateForShield with different txidVersion formats...');

// Test different txidVersion formats
const testCases = [
  { name: 'String constant', value: TXIDVersion.V2_PoseidonMerkle },
  { name: 'Numeric 2', value: 2 },
  { name: 'String "2"', value: '2' },
  { name: 'String "V2_PoseidonMerkle"', value: 'V2_PoseidonMerkle' },
  { name: 'Numeric 1', value: 1 },
  { name: 'String "1"', value: '1' },
  { name: 'Numeric 3', value: 3 },
  { name: 'String "3"', value: '3' }
];

// Mock parameters for testing
const mockParams = {
  networkName: NetworkName.EthereumSepolia,
  shieldPrivateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  erc20AmountRecipients: [{
    recipientAddress: '0zk1qtest1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    amount: '1000000000000000000',
    tokenAddress: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14'
  }],
  nftAmountRecipients: [],
  fromWalletPublicAddress: '0x1234567890abcdef1234567890abcdef1234567890'
};

console.log('🔍 Function signature:', gasEstimateForShield.toString().substring(0, 100));
console.log('🔍 Expected parameters:', gasEstimateForShield.length);

// Test each txidVersion format
for (const testCase of testCases) {
  console.log(`\n🧪 Testing: ${testCase.name} = ${testCase.value} (type: ${typeof testCase.value})`);
  
  try {
    // Try to call the function with this txidVersion
    const result = await gasEstimateForShield(
      testCase.value,
      mockParams.networkName,
      mockParams.shieldPrivateKey,
      mockParams.erc20AmountRecipients,
      mockParams.nftAmountRecipients,
      mockParams.fromWalletPublicAddress
    );
    
    console.log(`✅ SUCCESS with ${testCase.name}:`, result);
    console.log(`🎯 FOUND WORKING FORMAT: ${testCase.name} = ${testCase.value}`);
    break; // Found working format, stop testing
    
  } catch (error) {
    console.log(`❌ FAILED with ${testCase.name}:`, error.message);
    
    // Check if it's a parameter validation error
    if (error.message.includes('txidVersion') || error.message.includes('Parameter')) {
      console.log(`   → This suggests ${testCase.name} is the wrong format`);
    }
  }
}

console.log('\n🔍 Test complete. Check above for the working txidVersion format.');
