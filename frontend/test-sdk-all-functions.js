// COMPREHENSIVE RAILGUN SDK FUNCTION SIGNATURE TEST
// This will test EVERY single SDK function to show exactly what they expect

console.log('🔍 COMPREHENSIVE RAILGUN SDK FUNCTION SIGNATURE TEST');
console.log('==================================================');
console.log('Testing ALL SDK functions to reveal their exact signatures...\n');

// ALL the SDK functions we want to test
const ALL_SDK_FUNCTIONS = [
  // Core Engine Functions
  'startRailgunEngine',
  'loadProvider',
  'setPollingProviderForNetwork', 
  'setFallbackProviderForNetwork',
  
  // Wallet Management
  'createRailgunWallet',
  'walletForID',
  'getRailgunAddress',
  
  // Balance & Query Functions
  'balanceForERC20Token',
  'getTokenBalances',
  'getShieldPrivateKeySignatureMessage',
  
  // Shield Functions
  'gasEstimateForShield',
  'populateShield',
  'generateShieldTransaction',
  
  // Transfer Functions
  'generateTransferProof',
  'populateProvedTransfer',
  'generateUnshieldTransaction',
  
  // Utility Functions
  'getRandomBytes',
  'bytesToHex',
  'getProver',
  'setSnarkJSGroth16',
  
  // Network Functions
  'getNetworkConfig',
  'getChainType',
  'getChainID'
];

// Function to analyze a single function's signature in detail
function analyzeFunctionSignature(funcName, func) {
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
    
    // Show first few lines of implementation
    const lines = funcStr.split('\n').slice(0, 3);
    console.log(`  - Implementation preview:`);
    lines.forEach((line, i) => {
      if (line.trim()) {
        console.log(`    ${i + 1}: ${line.trim()}`);
      }
    });
    
  } catch (e) {
    console.log(`  - Could not analyze source: ${e.message}`);
  }
}

// Function to test a function with different parameter counts and types
async function testFunctionParameters(funcName, func) {
  console.log(`\n🧪 Testing ${funcName} with different parameters:`);
  
  // Test with 0 to 8 parameters (most SDK functions don't have more than 8)
  for (let paramCount = 0; paramCount <= 8; paramCount++) {
    try {
      // Create test parameters with different types
      const testParams = [];
      for (let i = 0; i < paramCount; i++) {
        // Use different types for testing
        if (i === 0) testParams.push('test');           // string
        else if (i === 1) testParams.push(123);         // number
        else if (i === 2) testParams.push({});          // object
        else if (i === 3) testParams.push([]);          // array
        else if (i === 4) testParams.push(null);        // null
        else if (i === 5) testParams.push(undefined);   // undefined
        else if (i === 6) testParams.push(true);        // boolean
        else testParams.push('0x' + '0'.repeat(40));    // address-like
      }
      
      console.log(`  - Testing with ${paramCount} parameters...`);
      
      // Try to call the function
      const result = await func(...testParams);
      console.log(`    ✅ SUCCESS with ${paramCount} params!`);
      console.log(`    - Result type: ${typeof result}`);
      console.log(`    - Result:`, result);
      
      // If we succeed, this might be the expected parameter count
      console.log(`    🎯 Function accepted ${paramCount} parameters`);
      break;
      
    } catch (error) {
      const errorMsg = error.message;
      console.log(`    ❌ FAILED with ${paramCount} params: ${errorMsg}`);
      
      // Check if this is a parameter count error
      if (errorMsg.includes('parameter') || 
          errorMsg.includes('argument') || 
          errorMsg.includes('expected') ||
          errorMsg.includes('required') ||
          errorMsg.includes('missing')) {
        console.log(`    🎯 This suggests the function expects ${paramCount} parameters`);
        break;
      }
      
      // Check if it's a different type of error (function might be working)
      if (errorMsg.includes('invalid') || 
          errorMsg.includes('type') || 
          errorMsg.includes('format')) {
        console.log(`    ⚠️ Function accepted ${paramCount} params but failed on type/format`);
        console.log(`    🎯 This suggests ${paramCount} is the correct parameter count`);
        break;
      }
    }
  }
}

// Function to test with actual SDK constants
async function testWithRealConstants(funcName, func) {
  console.log(`\n🔍 Testing ${funcName} with real SDK constants...`);
  
  try {
    // Import constants if available
    const { NetworkName, TXIDVersion } = await import('@railgun-community/shared-models');
    
    // Create realistic test parameters based on function name
    let testParams = [];
    
    if (funcName.includes('Shield')) {
      testParams = [
        TXIDVersion.V2_PoseidonMerkle || 'V2_PoseidonMerkle',
        NetworkName.EthereumSepolia || 'EthereumSepolia',
        '0x' + '0'.repeat(64), // shieldPrivateKey
        [{ recipientAddress: '0zk1qtest', amount: '1000', tokenAddress: '0x' + '1'.repeat(40) }], // recipients
        [], // nftRecipients
        '0x' + '1'.repeat(40) // fromAddress
      ];
    } else if (funcName.includes('Transfer') || funcName.includes('Proof')) {
      testParams = [
        TXIDVersion.V2_PoseidonMerkle || 'V2_PoseidonMerkle',
        NetworkName.EthereumSepolia || 'EthereumSepolia',
        'test-wallet-id', // walletID
        '0x' + '0'.repeat(64), // encryptionKey
        false, // showSenderAddress
        'test memo', // memo
        [{ recipientAddress: '0x' + '1'.repeat(40), amount: '1000', tokenAddress: '0x' + '2'.repeat(40) }], // recipients
        [], // nftRecipients
        undefined, // broadcasterFee
        false, // sendWithPublicWallet
        undefined, // gasPrice
        undefined // progressCallback
      ];
    } else if (funcName.includes('Balance')) {
      testParams = [
        TXIDVersion.V2_PoseidonMerkle || 'V2_PoseidonMerkle',
        {}, // wallet object
        NetworkName.EthereumSepolia || 'EthereumSepolia',
        '0x' + '1'.repeat(40), // tokenAddress
        true // onlySpendable
      ];
    } else if (funcName.includes('Engine')) {
      testParams = [
        'test-source', // walletSource
        {}, // db
        false, // shouldDebug
        {}, // artifactStore
        false, // useNativeArtifacts
        false, // skipMerkletreeScans
        [], // poiNodeURLs
        [], // customPOILists
        false // verboseScanLogging
      ];
    } else if (funcName.includes('Provider')) {
      testParams = [
        { chainId: 11155111, providers: [{ provider: 'https://test.com', priority: 1, weight: 1 }] }, // providersJSON
        NetworkName.EthereumSepolia || 'EthereumSepolia' // networkName
      ];
    } else if (funcName.includes('Wallet')) {
      testParams = [
        new Uint8Array(32), // encryptionKey
        'test mnemonic phrase', // mnemonic
        undefined, // creationBlockNumbers
        0 // derivationIndex
      ];
    } else {
      // Generic test parameters
      testParams = ['test', 123, {}, [], null, undefined, true, '0x' + '0'.repeat(40)];
    }
    
    console.log(`  - Testing with realistic parameters for ${funcName}...`);
    console.log(`  - Parameter count: ${testParams.length}`);
    
    const result = await func(...testParams);
    console.log(`    ✅ SUCCESS with realistic params!`);
    console.log(`    - Result:`, result);
    
  } catch (error) {
    console.log(`    ❌ FAILED with realistic params: ${error.message}`);
    
    // If it's a parameter error, show what we learned
    if (error.message.includes('parameter') || error.message.includes('argument')) {
      console.log(`    💡 This reveals the expected parameter structure`);
    }
  }
}

// Main comprehensive test function
async function runComprehensiveTest() {
  console.log('🚀 Starting comprehensive SDK function analysis...\n');
  
  try {
    // Step 1: Import ALL SDK functions
    console.log('1️⃣ Importing all SDK functions...');
    
    const walletModule = await import('@railgun-community/wallet');
    const sharedModels = await import('@railgun-community/shared-models');
    
    console.log('✅ Successfully imported SDK modules!');
    console.log(`  - Wallet module exports: ${Object.keys(walletModule).length} functions`);
    console.log(`  - Shared models exports: ${Object.keys(sharedModels).length} constants`);
    
    // Step 2: Show all available exports
    console.log('\n2️⃣ Available SDK exports:');
    console.log('==========================');
    
    console.log('\n📦 @railgun-community/wallet exports:');
    Object.keys(walletModule).forEach(key => {
      const item = walletModule[key];
      if (typeof item === 'function') {
        console.log(`  ✅ ${key}: function (${item.length} parameters)`);
      } else if (typeof item === 'object') {
        console.log(`  📁 ${key}: object (${Object.keys(item).length} keys)`);
      } else {
        console.log(`  🔧 ${key}: ${typeof item} = ${item}`);
      }
    });
    
    console.log('\n📦 @railgun-community/shared-models exports:');
    Object.keys(sharedModels).forEach(key => {
      const item = sharedModels[key];
      if (typeof item === 'function') {
        console.log(`  ✅ ${key}: function (${item.length} parameters)`);
      } else if (typeof item === 'object') {
        console.log(`  📁 ${key}: object (${Object.keys(item).length} keys)`);
      } else {
        console.log(`  🔧 ${key}: ${typeof item} = ${item}`);
      }
    });
    
    // Step 3: Analyze function signatures
    console.log('\n3️⃣ Analyzing function signatures:');
    console.log('================================');
    
    // Create a map of all functions we want to test
    const functionsToTest = {};
    
    ALL_SDK_FUNCTIONS.forEach(funcName => {
      if (walletModule[funcName]) {
        functionsToTest[funcName] = walletModule[funcName];
      } else if (sharedModels[funcName]) {
        functionsToTest[funcName] = sharedModels[funcName];
      } else {
        console.log(`❌ ${funcName}: NOT FOUND in SDK modules`);
      }
    });
    
    console.log(`\n🎯 Found ${Object.keys(functionsToTest).length} functions to test`);
    
    // Step 4: Analyze each function in detail
    Object.entries(functionsToTest).forEach(([name, func]) => {
      analyzeFunctionSignature(name, func);
    });
    
    // Step 5: Test key functions with parameters
    console.log('\n4️⃣ Testing key functions with parameters:');
    console.log('==========================================');
    
    // Test the most important functions first
    const priorityFunctions = [
      'gasEstimateForShield',
      'populateShield', 
      'balanceForERC20Token',
      'createRailgunWallet',
      'startRailgunEngine',
      'generateTransferProof',
      'populateProvedTransfer'
    ];
    
    for (const funcName of priorityFunctions) {
      if (functionsToTest[funcName]) {
        await testFunctionParameters(funcName, functionsToTest[funcName]);
        await testWithRealConstants(funcName, functionsToTest[funcName]);
      }
    }
    
    // Step 6: Test remaining functions
    console.log('\n5️⃣ Testing remaining functions:');
    console.log('===============================');
    
    const remainingFunctions = Object.keys(functionsToTest).filter(name => 
      !priorityFunctions.includes(name)
    );
    
    for (const funcName of remainingFunctions) {
      if (functionsToTest[funcName]) {
        await testFunctionParameters(funcName, functionsToTest[funcName]);
      }
    }
    
    console.log('\n🎉 COMPREHENSIVE TEST COMPLETE!');
    console.log('================================');
    console.log('Check the logs above to see exactly what each SDK function expects.');
    console.log('This should reveal the exact parameter signatures for your SDK version.');
    
  } catch (error) {
    console.error('❌ Failed to run comprehensive test:', error);
    console.log('\n💡 This might mean the SDK functions are not accessible from the console.');
    console.log('Try running this test from within your React app instead.');
  }
}

// Run the comprehensive test
runComprehensiveTest().catch(console.error);

console.log('\n📋 INSTRUCTIONS:');
console.log('1. Copy this entire script');
console.log('2. Open your React app in the browser');
console.log('3. Open browser console (F12 → Console)');
console.log('4. Paste and run this script');
console.log('5. Check the output to see exactly what each SDK function expects');
console.log('6. This will show ALL function signatures, parameter counts, and types');
