// test-network-connectivity.js
// Test actual network connectivity for Railgun SDK

console.log('🌐 Testing Railgun Network Connectivity...\n');

// Test RPC endpoints for each network
const networkTests = [
  {
    name: 'Ethereum_Sepolia',
    rpcUrl: 'https://rpc.sepolia.org',
    chainId: 11155111,
    expected: 'FREE testnet'
  },
  {
    name: 'Polygon_Amoy', 
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    chainId: 80002,
    expected: 'FREE testnet'
  },
  {
    name: 'Ethereum_Goerli',
    rpcUrl: 'https://rpc.ankr.com/eth_goerli',
    chainId: 5,
    expected: 'DEPRECATED but might work'
  },
  {
    name: 'Polygon_Mumbai',
    rpcUrl: 'https://rpc-mumbai.maticvigil.com',
    chainId: 80001,
    expected: 'DEPRECATED but might work'
  },
  {
    name: 'Arbitrum_Goerli',
    rpcUrl: 'https://goerli-rollup.arbitrum.io/rpc',
    chainId: 421613,
    expected: 'DEPRECATED but might work'
  },
  {
    name: 'Hardhat',
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    expected: 'LOCAL only'
  }
];

async function testNetworkConnectivity() {
  console.log('🔍 Testing each network...\n');
  
  for (const network of networkTests) {
    try {
      console.log(`📡 Testing ${network.name} (${network.expected})...`);
      console.log(`   RPC: ${network.rpcUrl}`);
      console.log(`   Chain ID: ${network.chainId}`);
      
      // Test basic RPC connectivity
      const response = await fetch(network.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          const chainId = parseInt(data.result, 16);
          console.log(`   ✅ RPC accessible - Chain ID: ${chainId}`);
          
          if (chainId === network.chainId) {
            console.log(`   🎯 Chain ID matches expected: ${network.chainId}`);
          } else {
            console.log(`   ⚠️  Chain ID mismatch: expected ${network.chainId}, got ${chainId}`);
          }
        } else {
          console.log(`   ❌ RPC error: ${data.error?.message || 'Unknown error'}`);
        }
      } else {
        console.log(`   ❌ HTTP error: ${response.status} ${response.statusText}`);
      }
      
      console.log('');
      
    } catch (error) {
      console.log(`   ❌ Connection failed: ${error.message}`);
      console.log('');
    }
  }
  
  console.log('🎯 Summary of Available Networks:');
  console.log('  • Ethereum_Sepolia - Most likely to work (active testnet)');
  console.log('  • Polygon_Amoy - Likely to work (new testnet)');
  console.log('  • Deprecated networks may have limited support');
  console.log('  • Hardhat - Only works with local ganache/hardhat');
  
  console.log('\n💡 Recommendation:');
  console.log('  Start with Ethereum_Sepolia for testing, then try Polygon_Amoy.');
  console.log('  Both are actively maintained testnets with free tokens available.');
}

// Run the test
testNetworkConnectivity().catch(console.error);
