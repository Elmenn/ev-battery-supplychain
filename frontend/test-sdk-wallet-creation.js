// Test script to check createRailgunWallet function signature and return format
console.log('🔍 Testing createRailgunWallet function signature...');

try {
  const { createRailgunWallet } = require('@railgun-community/wallet');
  
  console.log('✅ createRailgunWallet imported successfully');
  console.log('📝 Function type:', typeof createRailgunWallet);
  console.log('📝 Function length:', createRailgunWallet.length);
  
  // Check if it's a function
  if (typeof createRailgunWallet === 'function') {
    console.log('✅ createRailgunWallet is a function');
    
    // Try to get function source (if possible)
    try {
      const functionSource = createRailgunWallet.toString();
      console.log('📝 Function source (first 200 chars):', functionSource.substring(0, 200));
    } catch (e) {
      console.log('⚠️ Could not get function source:', e.message);
    }
  } else {
    console.log('❌ createRailgunWallet is not a function:', typeof createRailgunWallet);
  }
  
} catch (error) {
  console.error('❌ Failed to import createRailgunWallet:', error.message);
  
  // Try alternative imports
  try {
    const walletModule = require('@railgun-community/wallet');
    console.log('🔍 Available exports from @railgun-community/wallet:');
    console.log(Object.keys(walletModule));
    
    // Look for wallet creation functions
    const walletFunctions = Object.keys(walletModule).filter(key => 
      key.toLowerCase().includes('wallet') || 
      key.toLowerCase().includes('create') ||
      key.toLowerCase().includes('new')
    );
    console.log('🔍 Potential wallet creation functions:', walletFunctions);
    
  } catch (e) {
    console.error('❌ Could not inspect wallet module:', e.message);
  }
}
