// test-shielding-console.js - Browser Console Test Script
// 
// Copy and paste this entire script into your browser console
// Make sure your React app is running and connected to MetaMask
//
// Usage: After pasting, run: testShielding()

console.log('🧪 Loading Railgun Shielding Test Script...');

// Test configuration
const TEST_CONFIG = {
  testAmount: '0.01', // 0.01 WETH for testing
  wethAddress: '0xfff9976782d46CC05630d1f6eBAb18b2324d6B14'
};

// Helper function to parse ether amounts
function parseEther(amount) {
  return BigInt(Math.floor(parseFloat(amount) * 1e18));
}

// Helper function to format ether amounts
function formatEther(amount) {
  return (Number(amount) / 1e18).toFixed(6);
}

// Check current balances
async function checkBalances() {
  try {
    console.log('💰 Checking current balances...');
    
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    
    // Check ETH balance
    const ethBalance = await provider.getBalance(userAddress);
    console.log('  💎 ETH Balance:', formatEther(ethBalance), 'ETH');
    
    // Check WETH balance
    const wethContract = new ethers.Contract(TEST_CONFIG.wethAddress, [
      "function balanceOf(address owner) view returns (uint256)",
      "function symbol() view returns (string)"
    ], provider);
    
    const wethBalance = await wethContract.balanceOf(userAddress);
    const wethSymbol = await wethContract.symbol();
    console.log(`  🪙 ${wethSymbol} Balance:`, formatEther(wethBalance), wethSymbol);
    
    // Check private WETH balance (if SDK is ready)
    try {
      // Access the railgun client functions from the React app
      const railgunClient = window.railgunClient || 
                           (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && 
                            window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers?.get(1)?.getCurrentFiber?.()?.memoizedState?.element?.props?.children?.props?.railgunClient);
      
      if (railgunClient && railgunClient.getWalletBalance) {
        const privateBalance = await railgunClient.getWalletBalance(TEST_CONFIG.wethAddress);
        console.log('  🔒 Private WETH Balance:', privateBalance?.toString() || '0', 'WETH');
      } else {
        console.log('  🔒 Private WETH Balance: SDK not accessible yet');
      }
    } catch (e) {
      console.log('  🔒 Private WETH Balance: SDK not ready yet');
    }
    
    return { ethBalance, wethBalance, userAddress };
    
  } catch (error) {
    console.error('❌ Failed to check balances:', error);
    return null;
  }
}

// Quick validation test
async function quickValidationTest() {
  console.log('🔍 Quick Validation Test...');
  
  try {
    // Check if we're on Sepolia
    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    
    if (network.chainId !== 11155111n) {
      console.log('❌ Wrong network! Expected Sepolia (11155111), got', network.chainId);
      return false;
    }
    console.log('✅ Network: Sepolia testnet confirmed');
    
    // Check balances
    const balances = await checkBalances();
    if (!balances) return false;
    
    // Check if user has enough ETH for gas
    if (balances.ethBalance < parseEther('0.01')) {
      console.log('❌ Insufficient ETH for gas fees');
      return false;
    }
    console.log('✅ Sufficient ETH for gas fees');
    
    // Check if user has enough WETH
    const testAmount = parseEther(TEST_CONFIG.testAmount);
    if (balances.wethBalance < testAmount) {
      console.log('⚠️ Insufficient WETH, will need to wrap ETH first');
      return false;
    }
    console.log('✅ Sufficient WETH balance');
    
    console.log('✅ All prerequisites validated!');
    return true;
    
  } catch (error) {
    console.error('❌ Validation test failed:', error);
    return false;
  }
}

// Test WETH shielding
async function testWETHShielding() {
  console.log('🛡️ Testing WETH Shielding...');
  
  try {
    // First validate prerequisites
    const isValid = await quickValidationTest();
    if (!isValid) {
      console.log('❌ Prerequisites not met, cannot proceed with shielding');
      return null;
    }
    
    // Try to access the railgun client
    const railgunClient = window.railgunClient || 
                         (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && 
                          window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers?.get(1)?.getCurrentFiber?.()?.memoizedState?.element?.props?.children?.props?.railgunClient);
    
    if (!railgunClient || !railgunClient.shieldSepoliaWETH) {
      console.log('❌ Railgun client not accessible. Make sure the app is fully loaded.');
      return null;
    }
    
    // Test shielding
    const testAmount = parseEther(TEST_CONFIG.testAmount);
    console.log(`🚀 Shielding ${TEST_CONFIG.testAmount} WETH...`);
    
    const result = await railgunClient.shieldSepoliaWETH(testAmount);
    console.log('✅ Shielding completed:', result);
    
    return result;
    
  } catch (error) {
    console.error('❌ WETH shielding test failed:', error);
    return null;
  }
}

// Test ETH auto-wrapping and shielding
async function testETHShielding() {
  console.log('🔄 Testing ETH Auto-Wrapping and Shielding...');
  
  try {
    const railgunClient = window.railgunClient || 
                         (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && 
                          window.__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers?.get(1)?.getCurrentFiber?.()?.memoizedState?.element?.props?.children?.props?.railgunClient);
    
    if (!railgunClient || !railgunClient.shieldETH) {
      console.log('❌ Railgun client not accessible. Make sure the app is fully loaded.');
      return null;
    }
    
    const testAmount = parseEther(TEST_CONFIG.testAmount);
    console.log(`🚀 Shielding ${TEST_CONFIG.testAmount} ETH (will auto-wrap to WETH)...`);
    
    const result = await railgunClient.shieldETH(testAmount);
    console.log('✅ ETH shielding completed:', result);
    
    return result;
    
  } catch (error) {
    console.error('❌ ETH shielding test failed:', error);
    return null;
  }
}

// Main test function
async function testShielding() {
  console.log('🧪 Starting Railgun Shielding Test Suite...');
  console.log('==========================================');
  
  try {
    // Step 1: Check balances
    console.log('\n💰 Step 1: Checking current balances...');
    await checkBalances();
    
    // Step 2: Validate prerequisites
    console.log('\n🔍 Step 2: Validating prerequisites...');
    const isValid = await quickValidationTest();
    
    if (!isValid) {
      console.log('❌ Prerequisites not met. Please:');
      console.log('   - Ensure you are on Sepolia testnet');
      console.log('   - Have at least 0.01 ETH for gas fees');
      console.log('   - Have at least 0.01 WETH (or ETH to wrap)');
      return;
    }
    
    // Step 3: Test WETH shielding
    console.log('\n🛡️ Step 3: Testing WETH shielding...');
    const wethResult = await testWETHShielding();
    
    if (wethResult) {
      console.log('✅ WETH shielding test passed!');
    } else {
      console.log('⚠️ WETH shielding test failed or skipped');
    }
    
    // Step 4: Test ETH shielding
    console.log('\n🔄 Step 4: Testing ETH auto-wrapping and shielding...');
    const ethResult = await testETHShielding();
    
    if (ethResult) {
      console.log('✅ ETH shielding test passed!');
    } else {
      console.log('⚠️ ETH shielding test failed or skipped');
    }
    
    // Final balance check
    console.log('\n💰 Final Balance Check...');
    await checkBalances();
    
    console.log('\n🎉 Shielding test suite completed!');
    
  } catch (error) {
    console.error('❌ Shielding test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

// Export functions to global scope
window.testShielding = testShielding;
window.quickValidationTest = quickValidationTest;
window.testWETHShielding = testWETHShielding;
window.testETHShielding = testETHShielding;
window.checkBalances = checkBalances;

console.log('✅ Railgun Shielding Test Script Loaded!');
console.log('Available functions:');
console.log('  - testShielding()      : Full shielding test suite');
console.log('  - quickValidationTest(): Quick prerequisite validation');
console.log('  - testWETHShielding()  : Test WETH shielding');
console.log('  - testETHShielding()   : Test ETH auto-wrapping and shielding');
console.log('  - checkBalances()      : Check current balances');
console.log('\n💡 Run testShielding() to start the full test suite');
console.log('💡 Make sure your React app is running and connected to MetaMask');
