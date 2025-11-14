// Simple Console Test for Railgun SDK Function Signatures
// Copy and paste this into your React app's browser console

console.log('🔍 SIMPLE RAILGUN SDK FUNCTION TEST');
console.log('===================================');

// Test function to check what a function expects
function testFunction(funcName, func) {
  console.log(`\n📋 ${funcName}:`);
  console.log(`  - Type: ${typeof func}`);
  console.log(`  - Expected params: ${func.length}`);
  
  try {
    const source = func.toString();
    const paramMatch = source.match(/\(([^)]*)\)/);
    if (paramMatch) {
      const params = paramMatch[1].split(',').map(p => p.trim());
      console.log(`  - Parameters: [${params.join(', ')}]`);
    }
  } catch (e) {
    console.log(`  - Could not analyze: ${e.message}`);
  }
}

// Test function with different parameter counts
async function testWithParams(funcName, func) {
  console.log(`\n🧪 Testing ${funcName} parameters:`);
  
  for (let count = 0; count <= 6; count++) {
    try {
      const params = Array(count).fill('test');
      console.log(`  - ${count} params: ${params.join(', ')}`);
      
      const result = await func(...params);
      console.log(`    ✅ SUCCESS! Result:`, result);
      break;
      
    } catch (error) {
      console.log(`    ❌ FAILED: ${error.message}`);
      
      // If it's a parameter count error, we found the expected count
      if (error.message.includes('parameter') || error.message.includes('argument')) {
        console.log(`    🎯 Function expects ${count} parameters`);
        break;
      }
    }
  }
}

// Main test function
async function runSimpleTest() {
  try {
    // Try to access SDK functions through your app
    console.log('\n🔍 Looking for Railgun SDK functions...');
    
    // Check if any SDK functions are available globally
    const globalFunctions = [
      'startRailgunEngine',
      'gasEstimateForShield', 
      'populateShield',
      'balanceForERC20Token'
    ];
    
    let foundFunctions = {};
    
    globalFunctions.forEach(name => {
      if (typeof window[name] === 'function') {
        foundFunctions[name] = window[name];
        console.log(`✅ Found ${name} globally`);
      }
    });
    
    if (Object.keys(foundFunctions).length === 0) {
      console.log('❌ No SDK functions found globally');
      console.log('💡 The functions might be in your React app scope');
      console.log('💡 Try running this test from within your app component');
      return;
    }
    
    // Test the functions we found
    console.log('\n🧪 Testing found functions...');
    
    Object.entries(foundFunctions).forEach(([name, func]) => {
      testFunction(name, func);
      testWithParams(name, func);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Alternative: Try to access through your app's scope
function checkAppScope() {
  console.log('\n🔍 Checking your app scope for Railgun functions...');
  
  // Look for common patterns
  const possiblePaths = [
    'window.railgunWalletClient',
    'window.railgunUtils', 
    'window.railgun',
    'window.wallet'
  ];
  
  possiblePaths.forEach(path => {
    try {
      const obj = eval(path);
      if (obj) {
        console.log(`✅ Found: ${path}`);
        console.log('  - Type:', typeof obj);
        console.log('  - Keys:', Object.keys(obj));
        
        // Look for SDK functions in this object
        if (typeof obj === 'object') {
          const sdkFunctions = Object.keys(obj).filter(key => 
            key.includes('Shield') || 
            key.includes('Transfer') || 
            key.includes('Balance') ||
            key.includes('Engine')
          );
          
          if (sdkFunctions.length > 0) {
            console.log('  - SDK functions found:', sdkFunctions);
          }
        }
      }
    } catch (e) {
      // Path doesn't exist
    }
  });
}

// Run both tests
console.log('\n🚀 Running tests...');
runSimpleTest();
checkAppScope();

console.log('\n📋 INSTRUCTIONS:');
console.log('1. Make sure your React app is loaded');
console.log('2. Check the output above for SDK function signatures');
console.log('3. If no functions found, try running this from within your app component');
