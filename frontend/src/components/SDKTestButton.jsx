import React from 'react';

// Simplified SDK Test Button Component
// This will test the SDK functions from within your React app's scope

const SDKTestButton = () => {
  // Function to analyze a single function's signature
  const analyzeFunctionSignature = (funcName, func) => {
    console.log(`\n📋 ${funcName}:`);
    console.log(`  - Function type: ${typeof func}`);
    console.log(`  - Expected parameters: ${func.length}`);
    
    try {
      // Get the function source code
      const funcStr = func.toString();
      
      // Extract parameter names
      const paramMatch = funcStr.match(/\(([^)]*)\)/);
      if (paramMatch) {
        const params = paramMatch[1].split(',').map(p => p.trim());
        if (params.length === 1 && params[0] === '') {
          console.log(`  - Parameter names: [none]`);
        } else {
          console.log(`  - Parameter names: [${params.join(', ')}]`);
        }
      }
      
      // Show function signature preview
      const firstLine = funcStr.split('\n')[0];
      console.log(`  - Signature: ${firstLine}`);
      
    } catch (e) {
      console.log(`  - Could not analyze source: ${e.message}`);
    }
  };

  // Main test function
  const runSDKTest = async () => {
    console.log('🔍 TESTING RAILGUN SDK FROM WITHIN REACT APP');
    console.log('=============================================');
    
    try {
      // Import the SDK functions
      const { 
        gasEstimateForShield,
        populateShield,
        balanceForERC20Token,
        createRailgunWallet,
        startRailgunEngine,
        generateTransferProof,
        populateProvedTransfer,
        loadProvider,
        getRandomBytes,
        bytesToHex
      } = await import('@railgun-community/wallet');
      
      const { NetworkName, TXIDVersion, NETWORK_CONFIG } = await import('@railgun-community/shared-models');
      
      console.log('✅ Successfully imported SDK functions!');
      
      // Test 1: Analyze function signatures
      console.log('\n1️⃣ ANALYZING FUNCTION SIGNATURES:');
      console.log('==================================');
      
      const functionsToTest = {
        gasEstimateForShield,
        populateShield,
        balanceForERC20Token,
        createRailgunWallet,
        startRailgunEngine,
        generateTransferProof,
        populateProvedTransfer,
        loadProvider,
        getRandomBytes,
        bytesToHex
      };
      
      Object.entries(functionsToTest).forEach(([name, func]) => {
        if (typeof func === 'function') {
          analyzeFunctionSignature(name, func);
        } else {
          console.log(`❌ ${name}: Not a function (${typeof func})`);
        }
      });
      
      // Test 2: Analyze constants
      console.log('\n2️⃣ ANALYZING SDK CONSTANTS:');
      console.log('============================');
      
      if (NetworkName) {
        console.log('\n🌐 NetworkName constants:');
        Object.entries(NetworkName).forEach(([key, value]) => {
          console.log(`  - ${key}: ${value} (${typeof value})`);
        });
      }
      
      if (TXIDVersion) {
        console.log('\n🆔 TXIDVersion constants:');
        Object.entries(TXIDVersion).forEach(([key, value]) => {
          console.log(`  - ${key}: ${value} (${typeof value})`);
        });
      }
      
      if (NETWORK_CONFIG) {
        console.log('\n⚙️ NETWORK_CONFIG:');
        console.log(`  - Type: ${typeof NETWORK_CONFIG}`);
        if (typeof NETWORK_CONFIG === 'object') {
          console.log(`  - Available networks: ${Object.keys(NETWORK_CONFIG).join(', ')}`);
          
          // Check Sepolia config specifically
          if (NETWORK_CONFIG.EthereumSepolia) {
            const sepoliaConfig = NETWORK_CONFIG.EthereumSepolia;
            console.log(`  - Sepolia config:`, sepoliaConfig);
          }
        }
      }
      
      console.log('\n🎉 SDK TEST COMPLETE!');
      console.log('=====================');
      console.log('Check the console above to see:');
      console.log('1. Exact function signatures and parameter counts');
      console.log('2. Available constants and their values');
      
    } catch (error) {
      console.error('❌ Failed to test SDK:', error);
      console.log('💡 Make sure your React app has loaded the Railgun SDK.');
    }
  };

  return (
    <div style={{ 
      padding: '20px', 
      border: '2px solid #007bff', 
      borderRadius: '8px', 
      margin: '20px 0',
      backgroundColor: '#f8f9fa'
    }}>
      <h3 style={{ color: '#007bff', marginTop: 0 }}>🔍 Railgun SDK Test</h3>
      <p style={{ marginBottom: '15px' }}>
        Click the button below to test the Railgun SDK function signatures from within your React app.
      </p>
      <button 
        onClick={runSDKTest}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        🧪 Test SDK Functions
      </button>
      <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
        Check the browser console (F12 → Console) for detailed results.
      </p>
    </div>
  );
};

export default SDKTestButton;
