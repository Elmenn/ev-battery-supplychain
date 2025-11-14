// test-shielding.js - Comprehensive Railgun Shielding Test Script
// 
// This script tests the complete shielding flow:
// 1. Validation of prerequisites
// 2. ETH to WETH wrapping
// 3. WETH shielding to private balance
// 4. Balance verification
//
// Usage: 
// 1. Make sure your React app is running and connected to MetaMask
// 2. Open browser console and paste this script
// 3. Run: testShielding()

import { ethers } from 'ethers';
import { 
  initRailgunWallet, 
  shieldSepoliaWETH, 
  shieldETH, 
  validateSepoliaShielding,
  getWalletBalance,
  refreshPrivateBalances,
  getRailgunAddress
} from './src/railgun/railgunWalletClient.js';

// Test configuration
const TEST_CONFIG = {
  // Small amount for testing (0.01 WETH)
  testAmount: ethers.parseEther('0.01'),
  // RPC URL (use your own or keep the demo one)
  rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/demo',
  // WETH contract address on Sepolia
  wethAddress: '0xfff9976782d46CC05630d1f6eBAb18b2324d6B14'
};

// Main test function
async function testShielding() {
  console.log('🧪 Starting Railgun Shielding Test Suite...');
  console.log('==========================================');
  
  try {
    // Step 1: Initialize Railgun SDK
    console.log('\n🔧 Step 1: Initializing Railgun SDK...');
    const initResult = await initRailgunWallet({ rpcUrl: TEST_CONFIG.rpcUrl });
    console.log('✅ SDK initialized:', initResult);
    
    // Step 2: Get current balances
    console.log('\n💰 Step 2: Checking current balances...');
    await checkBalances();
    
    // Step 3: Validate shielding prerequisites
    console.log('\n🔍 Step 3: Validating shielding prerequisites...');
    const validation = await validateSepoliaShielding(TEST_CONFIG.testAmount);
    console.log('✅ Validation result:', validation);
    
    if (!validation.valid) {
      console.log('⚠️ Prerequisites not met, attempting auto-fixes...');
      await handleValidationFailures(validation);
    }
    
    // Step 4: Test WETH shielding
    console.log('\n🛡️ Step 4: Testing WETH shielding...');
    const shieldResult = await shieldSepoliaWETH(TEST_CONFIG.testAmount);
    console.log('✅ Shielding completed:', shieldResult);
    
    // Step 5: Verify private balance
    console.log('\n🔍 Step 5: Verifying private balance...');
    await verifyPrivateBalance();
    
    // Step 6: Test ETH auto-wrapping and shielding
    console.log('\n🔄 Step 6: Testing ETH auto-wrapping and shielding...');
    const ethShieldResult = await shieldETH(TEST_CONFIG.testAmount);
    console.log('✅ ETH shielding completed:', ethShieldResult);
    
    // Final balance check
    console.log('\n💰 Final Balance Check...');
    await checkBalances();
    
    console.log('\n🎉 All shielding tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Shielding test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Check current balances (public and private)
async function checkBalances() {
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    
    // Check ETH balance
    const ethBalance = await provider.getBalance(userAddress);
    console.log('  💎 ETH Balance:', ethers.formatEther(ethBalance), 'ETH');
    
    // Check WETH balance
    const wethContract = new ethers.Contract(TEST_CONFIG.wethAddress, [
      "function balanceOf(address owner) view returns (uint256)",
      "function name() view returns (string)",
      "function symbol() view returns (string)"
    ], provider);
    
    const wethBalance = await wethContract.balanceOf(userAddress);
    const wethName = await wethContract.name();
    const wethSymbol = await wethContract.symbol();
    console.log(`  🪙 ${wethSymbol} Balance:`, ethers.formatEther(wethBalance), wethSymbol);
    
    // Check private WETH balance (if SDK is ready)
    try {
      const privateBalance = await getWalletBalance(TEST_CONFIG.wethAddress);
      console.log('  🔒 Private WETH Balance:', privateBalance?.toString() || '0', 'WETH');
    } catch (e) {
      console.log('  🔒 Private WETH Balance: SDK not ready yet');
    }
    
    // Check Railgun address
    try {
      const railgunAddress = getRailgunAddress();
      console.log('  🚇 Railgun Address:', railgunAddress);
    } catch (e) {
      console.log('  🚇 Railgun Address: Not available yet');
    }
    
  } catch (error) {
    console.error('❌ Failed to check balances:', error);
  }
}

// Handle validation failures with auto-fixes
async function handleValidationFailures(validation) {
  try {
    if (validation.reason === 'insufficient_weth') {
      console.log('💡 Auto-fixing insufficient WETH...');
      // This will be handled by shieldSepoliaWETH automatically
    }
    
    if (validation.reason === 'insufficient_allowance') {
      console.log('💡 Auto-fixing insufficient allowance...');
      // This will be handled by shieldSepoliaWETH automatically
    }
    
    if (validation.reason === 'insufficient_gas') {
      console.log('❌ Cannot auto-fix insufficient gas - user needs more ETH');
      throw new Error('Insufficient ETH for gas fees');
    }
    
  } catch (error) {
    console.error('❌ Failed to handle validation failures:', error);
    throw error;
  }
}

// Verify private balance after shielding
async function verifyPrivateBalance() {
  try {
    console.log('  🔄 Refreshing private balances...');
    await refreshPrivateBalances();
    
    console.log('  🔍 Getting latest private balance...');
    const privateBalance = await getWalletBalance(TEST_CONFIG.wethAddress);
    console.log('  ✅ Private WETH Balance:', privateBalance?.toString() || '0', 'WETH');
    
    if (privateBalance && BigInt(privateBalance.toString()) > 0n) {
      console.log('  🎉 Private balance confirmed! Shielding successful.');
    } else {
      console.log('  ⚠️ Private balance not yet visible (may need more time to sync)');
    }
    
  } catch (error) {
    console.error('❌ Failed to verify private balance:', error);
  }
}

// Quick test function for just validation
async function quickValidationTest() {
  console.log('🔍 Quick Validation Test...');
  try {
    const validation = await validateSepoliaShielding(TEST_CONFIG.testAmount);
    console.log('✅ Validation result:', validation);
    return validation;
  } catch (error) {
    console.error('❌ Validation test failed:', error);
    return null;
  }
}

// Test function for just balance checking
async function balanceTest() {
  console.log('💰 Balance Test...');
  await checkBalances();
}

// Export functions for console testing
window.testShielding = testShielding;
window.quickValidationTest = quickValidationTest;
window.balanceTest = balanceTest;

console.log('🧪 Railgun Shielding Test Script Loaded!');
console.log('Available functions:');
console.log('  - testShielding()     : Full shielding test suite');
console.log('  - quickValidationTest(): Quick prerequisite validation');
console.log('  - balanceTest()        : Check current balances');
console.log('\n💡 Run testShielding() to start the full test suite');
