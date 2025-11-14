// Test script to run the truth dump
console.log('🧪 Testing Railgun Truth Dump...');

// This will be available in the browser console
if (typeof window !== 'undefined' && window.logRailgunTruth) {
  console.log('✅ logRailgunTruth function is available');
  console.log('💡 Run: await window.logRailgunTruth() in browser console');
} else {
  console.log('❌ logRailgunTruth function not available');
}

if (typeof window !== 'undefined' && window.assertSepoliaReady) {
  console.log('✅ assertSepoliaReady function is available');
  console.log('💡 Run: window.assertSepoliaReady() in browser console');
} else {
  console.log('❌ assertSepoliaReady function not available');
}

console.log('\n📋 Available debug functions:');
console.log('- window.logRailgunTruth() - Complete configuration dump');
console.log('- window.assertSepoliaReady() - Validate Sepolia config');
console.log('- window.forceStopAllScanning() - Stop infinite loops');
console.log('- window.stopTXIDLoop() - Stop TXID scanning');


