// Test to understand what address format populateShield expects
console.log('🔍 SHIELD ADDRESS FORMAT ANALYSIS');
console.log('==================================\n');

try {
  const { populateShield, NetworkName } = require('@railgun-community/wallet');
  
  console.log('📦 populateShield function found:', typeof populateShield);
  console.log('📦 Function parameters:', populateShield.length);
  
  // Try to understand the function signature
  try {
    const funcSource = populateShield.toString();
    const lines = funcSource.split('\n');
    
    console.log('\n📝 populateShield source (first few lines):');
    lines.slice(0, 15).forEach((line, i) => {
      console.log(`   ${i + 1}: ${line}`);
    });
    
    // Look for address validation or expected format
    if (funcSource.includes('address')) {
      console.log('\n🔍 Found address-related code:');
      const addressLines = lines.filter(line => line.includes('address'));
      addressLines.forEach((line, i) => {
        console.log(`   ${i + 1}: ${line}`);
      });
    }
    
  } catch (e) {
    console.log('⚠️ Could not extract function source:', e.message);
  }
  
  // Check if there are any address validation functions
  console.log('\n🔍 Looking for address validation functions...');
  
  const walletModule = require('@railgun-community/wallet');
  const addressRelated = Object.keys(walletModule).filter(key => 
    key.toLowerCase().includes('address') || 
    key.toLowerCase().includes('validate') ||
    key.toLowerCase().includes('assert')
  );
  
  console.log('Address-related exports:', addressRelated);
  
  // Check specific validation functions
  if (walletModule.assertValidRailgunAddress) {
    console.log('\n✅ assertValidRailgunAddress found');
    try {
      const funcSource = walletModule.assertValidRailgunAddress.toString();
      const lines = funcSource.split('\n');
      console.log('   Source (first 5 lines):');
      lines.slice(0, 5).forEach((line, i) => {
        console.log(`     ${i + 1}: ${line}`);
      });
    } catch (e) {
      console.log('   Could not extract source');
    }
  }
  
  if (walletModule.validateRailgunAddress) {
    console.log('\n✅ validateRailgunAddress found');
    try {
      const funcSource = walletModule.validateRailgunAddress.toString();
      const lines = funcSource.split('\n');
      console.log('   Source (first 5 lines):');
      lines.slice(0, 5).forEach((line, i) => {
        console.log(`     ${i + 1}: ${line}`);
      });
    } catch (e) {
      console.log('   Could not extract source');
    }
  }
  
} catch (error) {
  console.error('❌ Failed to analyze shield address format:', error.message);
}
