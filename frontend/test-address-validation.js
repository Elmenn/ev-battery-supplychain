// Test to understand exactly what validateRailgunAddress expects
console.log('🔍 ADDRESS VALIDATION DETAILED ANALYSIS');
console.log('========================================\n');

try {
  const { validateRailgunAddress, assertValidRailgunAddress } = require('@railgun-community/wallet');
  
  console.log('📦 Validation functions found:');
  console.log('   - validateRailgunAddress:', typeof validateRailgunAddress);
  console.log('   - assertValidRailgunAddress:', typeof assertValidRailgunAddress);
  
  // Test our current address format
  const ourAddress = '0x5003E469a73D930c41faa21b038A9b0bbA848895';
  console.log('\n🔍 Testing our address:', ourAddress);
  
  try {
    const isValid = validateRailgunAddress(ourAddress);
    console.log('✅ validateRailgunAddress result:', isValid);
  } catch (error) {
    console.log('❌ validateRailgunAddress error:', error.message);
  }
  
  try {
    assertValidRailgunAddress(ourAddress);
    console.log('✅ assertValidRailgunAddress passed');
  } catch (error) {
    console.log('❌ assertValidRailgunAddress error:', error.message);
  }
  
  // Test the address from createRailgunWallet
  const sdkAddress = '0zk1qyvsvggd2vgfapsnz3vnl0yfy4lh67kxqz5msh6cffe2vpqzc7umlk4k8yqr8k992al9yk3z02df5m9h5np3la4vwmsnpv6';
  console.log('\n🔍 Testing SDK address:', sdkAddress);
  
  try {
    const isValid = validateRailgunAddress(sdkAddress);
    console.log('✅ validateRailgunAddress result:', isValid);
  } catch (error) {
    console.log('❌ validateRailgunAddress error:', error.message);
  }
  
  try {
    assertValidRailgunAddress(sdkAddress);
    console.log('✅ assertValidRailgunAddress passed');
  } catch (error) {
    console.log('❌ assertValidRailgunAddress error:', error.message);
  }
  
  // Check what the SDK actually expects
  console.log('\n🔍 Understanding the issue...');
  console.log('   Our address (0x...):', ourAddress);
  console.log('   SDK address (0zk...):', sdkAddress);
  console.log('   Length difference:', sdkAddress.length - ourAddress.length);
  
  // The issue: we're using the wrong address!
  // createRailgunWallet returns {id, railgunAddress} where railgunAddress is the REAL Railgun address
  // But we're storing our own generated address instead
  
} catch (error) {
  console.error('❌ Failed to analyze address validation:', error.message);
}
