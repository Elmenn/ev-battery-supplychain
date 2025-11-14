// test-shielding-simple.js - Simple Shielding Test
// Copy and paste this into your browser console after the app loads

console.log('🧪 Simple Shielding Test Loaded!');

// Quick test function
async function testShield() {
  try {
    console.log('🚀 Starting simple shield test...');
    
    // Check if we're on Sepolia
    const provider = new ethers.BrowserProvider(window.ethereum);
    const network = await provider.getNetwork();
    
    if (network.chainId !== 11155111n) {
      console.log('❌ Wrong network! Switch to Sepolia testnet');
      return;
    }
    console.log('✅ Network: Sepolia testnet');
    
    // Check balances
    const signer = await provider.getSigner();
    const userAddress = await signer.getAddress();
    const ethBalance = await provider.getBalance(userAddress);
    const wethAddress = '0xfff9976782d46CC05630d1f6eBAb18b2324d6B14';
    
    console.log('💰 Balances:');
    console.log(`  ETH: ${ethers.formatEther(ethBalance)} ETH`);
    
    // Check WETH balance
    const wethContract = new ethers.Contract(wethAddress, [
      "function balanceOf(address owner) view returns (uint256)",
      "function symbol() view returns (string)"
    ], provider);
    
    const wethBalance = await wethContract.balanceOf(userAddress);
    const wethSymbol = await wethContract.symbol();
    console.log(`  ${wethSymbol}: ${ethers.formatEther(wethBalance)} ${wethSymbol}`);
    
    // Test amount: 0.01 WETH
    const testAmount = ethers.parseEther('0.01');
    
    if (wethBalance < testAmount) {
      console.log('⚠️ Insufficient WETH, will need to wrap ETH first');
    } else {
      console.log('✅ Sufficient WETH for testing');
    }
    
    // Try to access the railgun client
    console.log('🔍 Looking for Railgun client...');
    
    // Method 1: Check if it's globally available
    if (window.railgunClient) {
      console.log('✅ Found railgunClient in window');
      return window.railgunClient;
    }
    
    // Method 2: Check React DevTools
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      console.log('✅ Found React DevTools, checking for railgun client...');
      // This is a complex path, but let's try to find it
    }
    
    // Method 3: Check if the test button is working
    console.log('💡 Try using the Shielding Test Button in the Private Payment Modal');
    console.log('💡 Or check if the railgun client is accessible through the modal');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Export to global scope
window.testShield = testShield;

console.log('💡 Run testShield() to start testing');
console.log('💡 Make sure you have the Private Payment Modal open');
