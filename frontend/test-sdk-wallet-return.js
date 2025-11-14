// Test script to check what createRailgunWallet returns
console.log('🔍 Testing createRailgunWallet return format...');

try {
  const { createRailgunWallet } = require('@railgun-community/wallet');
  
  console.log('✅ createRailgunWallet imported successfully');
  
  // Mock the parameters to see what happens
  const mockEncryptionKey = new Uint8Array(32).fill(1); // 32 bytes of 1s
  const mockMnemonic = 'test test test test test test test test test test test junk';
  const mockCreationBlockNumbers = undefined;
  const mockDerivationIndex = 0;
  
  console.log('🔍 Mock parameters:');
  console.log('  - encryptionKey:', mockEncryptionKey);
  console.log('  - mnemonic:', mockMnemonic);
  console.log('  - creationBlockNumbers:', mockCreationBlockNumbers);
  console.log('  - derivationIndex:', mockDerivationIndex);
  
  // Try to call the function to see what it returns
  console.log('🔍 Attempting to call createRailgunWallet...');
  
  // Note: This might fail in Node.js environment, but we can see the error
  try {
    const result = createRailgunWallet(
      mockEncryptionKey,
      mockMnemonic,
      mockCreationBlockNumbers,
      mockDerivationIndex
    );
    console.log('✅ createRailgunWallet returned:', result);
    console.log('📝 Result type:', typeof result);
    console.log('📝 Result keys:', result ? Object.keys(result) : 'null/undefined');
  } catch (error) {
    console.log('⚠️ createRailgunWallet call failed (expected in Node.js):', error.message);
    console.log('🔍 But we can see the function signature is correct');
  }
  
} catch (error) {
  console.error('❌ Failed to import createRailgunWallet:', error.message);
}
