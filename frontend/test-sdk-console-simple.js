// Simple console test for Railgun SDK function signatures
// Copy and paste this into your browser console AFTER your React app has loaded

console.log('🔍 RAILGUN SDK FUNCTION SIGNATURE TEST');
console.log('=====================================');

// Function to check what SDK functions are available
function checkSDKAvailability() {
    console.log('\n🔍 Checking for available SDK functions...');
    
    // Look for common SDK function names
    const possibleFunctions = [
        'gasEstimateForShield',
        'populateShield',
        'startRailgunEngine',
        'loadProvider',
        'createRailgunWallet',
        'balanceForERC20Token',
        'generateTransferProof',
        'populateProvedTransfer'
    ];
    
    let foundFunctions = {};
    
    possibleFunctions.forEach(funcName => {
        if (typeof window[funcName] === 'function') {
            foundFunctions[funcName] = window[funcName];
            console.log(`✅ Found: ${funcName}`);
        } else {
            console.log(`❌ Not found: ${funcName}`);
        }
    });
    
    // Also check for any Railgun-related properties
    const railgunProps = Object.keys(window).filter(key => 
        key.toLowerCase().includes('railgun') || 
        key.toLowerCase().includes('shield') ||
        key.toLowerCase().includes('wallet')
    );
    
    if (railgunProps.length > 0) {
        console.log('\n🔍 Found Railgun-related properties:');
        railgunProps.forEach(prop => {
            const value = window[prop];
            console.log(`  - ${prop}: ${typeof value}${typeof value === 'function' ? ` (${value.length} params)` : ''}`);
        });
    }
    
    return foundFunctions;
}

// Function to analyze function signatures
function analyzeFunctionSignatures(functions) {
    if (Object.keys(functions).length === 0) {
        console.log('\n❌ No SDK functions found to analyze');
        return;
    }
    
    console.log('\n🔍 FUNCTION SIGNATURE ANALYSIS:');
    console.log('===============================');
    
    Object.entries(functions).forEach(([name, func]) => {
        console.log(`\n📋 ${name}:`);
        console.log(`  - Expected parameters: ${func.length}`);
        console.log(`  - Function type: ${typeof func}`);
        
        // Try to get parameter names from function source
        try {
            const funcStr = func.toString();
            const paramMatch = funcStr.match(/\(([^)]*)\)/);
            if (paramMatch) {
                const params = paramMatch[1].split(',').map(p => p.trim());
                console.log(`  - Parameter names: [${params.join(', ')}]`);
            }
            
            // Show first part of function source
            console.log(`  - Source preview: ${funcStr.substring(0, 100)}...`);
        } catch (e) {
            console.log(`  - Could not analyze source: ${e.message}`);
        }
    });
}

// Function to test function calls with minimal parameters
async function testFunctionCalls(functions) {
    if (Object.keys(functions).length === 0) {
        console.log('\n❌ No SDK functions found to test');
        return;
    }
    
    console.log('\n🧪 TESTING FUNCTION CALLS:');
    console.log('==========================');
    
    for (const [name, func] of Object.entries(functions)) {
        console.log(`\n🔬 Testing ${name}:`);
        
        // Test with no parameters
        try {
            await func();
            console.log(`  ✅ No params: SUCCESS (unexpected!)`);
        } catch (error) {
            console.log(`  ❌ No params: ${error.message}`);
        }
        
        // Test with 1 parameter (if function expects at least 1)
        if (func.length >= 1) {
            try {
                await func('test');
                console.log(`  ✅ 1 param: SUCCESS (unexpected!)`);
            } catch (error) {
                console.log(`  ❌ 1 param: ${error.message}`);
            }
        }
        
        // Test with 2 parameters (if function expects at least 2)
        if (func.length >= 2) {
            try {
                await func('test1', 'test2');
                console.log(`  ✅ 2 params: SUCCESS (unexpected!)`);
            } catch (error) {
                console.log(`  ❌ 2 params: ${error.message}`);
            }
        }
        
        // Test with 3 parameters (if function expects at least 3)
        if (func.length >= 3) {
            try {
                await func('test1', 'test2', 'test3');
                console.log(`  ✅ 3 params: SUCCESS (unexpected!)`);
            } catch (error) {
                console.log(`  ❌ 3 params: ${error.message}`);
            }
        }
        
        // Test with 4 parameters (if function expects at least 4)
        if (func.length >= 4) {
            try {
                await func('test1', 'test2', 'test3', 'test4');
                console.log(`  ✅ 4 params: SUCCESS (unexpected!)`);
            } catch (error) {
                console.log(`  ❌ 4 params: ${error.message}`);
            }
        }
        
        // Test with 5 parameters (if function expects at least 5)
        if (func.length >= 5) {
            try {
                await func('test1', 'test2', 'test3', 'test4', 'test5');
                console.log(`  ✅ 5 params: SUCCESS (unexpected!)`);
            } catch (error) {
                console.log(`  ❌ 5 params: ${error.message}`);
            }
        }
        
        // Test with 6 parameters (if function expects at least 6)
        if (func.length >= 6) {
            try {
                await func('test1', 'test2', 'test3', 'test4', 'test5', 'test6');
                console.log(`  ✅ 6 params: SUCCESS (unexpected!)`);
            } catch (error) {
                console.log(`  ❌ 6 params: ${error.message}`);
            }
        }
    }
}

// Main test runner
async function runSDKTest() {
    console.log('\n🚀 Starting Railgun SDK function signature test...');
    
    // Step 1: Check what's available
    const functions = checkSDKAvailability();
    
    // Step 2: Analyze signatures
    analyzeFunctionSignatures(functions);
    
    // Step 3: Test function calls
    await testFunctionCalls(functions);
    
    console.log('\n✅ SDK function signature test complete!');
    console.log('\n📋 SUMMARY:');
    console.log('  - Check the function lengths above to see expected parameter counts');
    console.log('  - Check the error messages to understand what each function expects');
    console.log('  - Compare with the official documentation to identify any discrepancies');
}

// Run the test
console.log('\n💡 To run the test, type: runSDKTest()');
console.log('💡 Or just press Enter to run it automatically...');

// Auto-run after a short delay
setTimeout(() => {
    console.log('\n⏰ Auto-running test in 2 seconds...');
    setTimeout(runSDKTest, 2000);
}, 1000);
