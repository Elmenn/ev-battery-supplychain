/**
 * TXID Sync Solution Tests
 * 
 * These tests help verify the root cause and test potential solutions
 * for the TXID merkletree not growing on Sepolia.
 * 
 * Run in browser console after engine is initialized:
 *   await window.testTXIDSyncSolutions()
 */

export async function testTXIDSyncSolutions() {
  const results = {
    timestamp: new Date().toISOString(),
    network: 'Sepolia',
    chain: { type: 0, id: 11155111 },
    tests: {}
  };

  console.log('🧪 Testing TXID Sync Solutions for Sepolia');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Test 1: Check current engine state
  console.log('📊 [Test 1] Checking engine state...');
  try {
    const engine = window.RGV2?.RG?.getEngine?.();
    if (engine) {
      results.tests.engineState = {
        exists: true,
        isPOINode: engine.isPOINode ?? false,
        hasGetLatestValidatedRailgunTxid: typeof engine.getLatestValidatedRailgunTxid === 'function',
        hasQuickSync: typeof engine.quickSyncRailgunTransactionsV2 === 'function'
      };
      console.log('   ✅ Engine available');
      console.log(`   📊 isPOINode: ${results.tests.engineState.isPOINode}`);
      console.log(`   📊 has getLatestValidatedRailgunTxid: ${results.tests.engineState.hasGetLatestValidatedRailgunTxid}`);
      console.log(`   📊 has quickSyncRailgunTransactionsV2: ${results.tests.engineState.hasQuickSync}`);
    } else {
      results.tests.engineState = { exists: false };
      console.log('   ❌ Engine not available');
      return results;
    }
  } catch (e) {
    results.tests.engineState = { error: e.message };
    console.log(`   ❌ Error: ${e.message}`);
    return results;
  }

  // Test 2: Test POI node response
  console.log('\n📊 [Test 2] Testing POI node response...');
  try {
    const engine = window.RGV2?.RG?.getEngine?.();
    if (engine?.getLatestValidatedRailgunTxid) {
      const poiRequester = engine.getLatestValidatedRailgunTxid;
      const result = await poiRequester(
        window.RGV2?.shared?.TXIDVersion?.V2_PoseidonMerkle,
        { type: 0, id: 11155111 }
      );
      results.tests.poiNodeResponse = {
        success: true,
        result: {
          txidIndex: result?.txidIndex ?? null,
          merkleroot: result?.merkleroot ?? null
        }
      };
      console.log('   ✅ POI node responded successfully');
      console.log(`   📊 TXID Index: ${result?.txidIndex ?? 'null'}`);
      console.log(`   📊 Merkleroot: ${result?.merkleroot ? result.merkleroot.substring(0, 20) + '...' : 'null'}`);
    } else {
      results.tests.poiNodeResponse = { success: false, error: 'getLatestValidatedRailgunTxid not available' };
      console.log('   ⚠️ getLatestValidatedRailgunTxid not available on engine');
    }
  } catch (error) {
    results.tests.poiNodeResponse = {
      success: false,
      error: error.message,
      stack: error.stack
    };
    console.log(`   ❌ POI node error: ${error.message}`);
    console.log('   💡 This confirms the root cause - POI node fails, exception prevents TXID sync');
  }

  // Test 3: Test GraphQL fetch
  console.log('\n📊 [Test 3] Testing GraphQL fetch...');
  try {
    const txs = await window.RGV2?.RG?.quickSyncRailgunTransactionsV2?.(
      { type: 0, id: 11155111 },
      null
    );
    results.tests.graphQLFetch = {
      success: true,
      transactionCount: txs?.length ?? 0,
      sampleTxid: txs?.[0]?.transactionHash || txs?.[0]?.txid || null
    };
    console.log(`   ✅ GraphQL fetch succeeded`);
    console.log(`   📊 Fetched ${txs?.length ?? 0} transactions`);
    if (txs && txs.length > 0) {
      console.log(`   📊 Sample txid: ${txs[0]?.transactionHash || txs[0]?.txid || 'N/A'}`);
    }
  } catch (error) {
    results.tests.graphQLFetch = {
      success: false,
      error: error.message
    };
    console.log(`   ❌ GraphQL fetch error: ${error.message}`);
  }

  // Test 4: Check current TXID tree status
  console.log('\n📊 [Test 4] Checking current TXID tree status...');
  try {
    const txidData = await window.RGV2?.RG?.getLatestRailgunTxidData?.(
      window.RGV2?.shared?.TXIDVersion?.V2_PoseidonMerkle,
      window.RGV2?.SEPOLIA?.networkName
    );
    results.tests.txidTreeStatus = {
      txidIndex: txidData?.txidIndex ?? -1,
      merkleroot: txidData?.merkleroot ?? null,
      isSynced: (txidData?.txidIndex ?? -1) >= 0
    };
    console.log(`   📊 TXID Index: ${txidData?.txidIndex ?? -1}`);
    console.log(`   📊 Merkleroot: ${txidData?.merkleroot ? txidData.merkleroot.substring(0, 20) + '...' : 'null'}`);
    console.log(`   📊 Is synced: ${results.tests.txidTreeStatus.isSynced ? '✅ Yes' : '❌ No'}`);
  } catch (error) {
    results.tests.txidTreeStatus = { error: error.message };
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Test 5: Test if specific TXID exists
  console.log('\n📊 [Test 5] Testing if your TXID exists...');
  try {
    const testTxid = '0x35d98f0b0f011f74e6f3bf0f56c15106fb4799bf44040b2d009a54a7db91f87a';
    const exists = await window.RGV2?.RG?.validateRailgunTxidExists?.(
      window.RGV2?.shared?.TXIDVersion?.V2_PoseidonMerkle,
      window.RGV2?.SEPOLIA?.networkName,
      testTxid
    );
    results.tests.txidExists = {
      testTxid,
      exists: exists ?? false
    };
    console.log(`   📊 TXID ${testTxid.substring(0, 20)}...`);
    console.log(`   📊 Exists in tree: ${exists ? '✅ Yes' : '❌ No'}`);
  } catch (error) {
    results.tests.txidExists = { error: error.message };
    console.log(`   ❌ Error: ${error.message}`);
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const poiFailed = results.tests.poiNodeResponse?.success === false;
  const graphQLWorks = results.tests.graphQLFetch?.success === true;
  const treeEmpty = results.tests.txidTreeStatus?.txidIndex === -1;
  const txidMissing = results.tests.txidExists?.exists === false;

  if (poiFailed && graphQLWorks && treeEmpty && txidMissing) {
    console.log('✅ ROOT CAUSE CONFIRMED:');
    console.log('   → GraphQL fetch works (can get transactions)');
    console.log('   → POI node fails (causes exception)');
    console.log('   → TXID tree empty (transactions never added)');
    console.log('   → Your TXID missing (confirming tree never grew)');
    console.log('\n💡 SOLUTION: Need to handle POI node failure gracefully');
    console.log('   Option 1: Enable isPOINode mode (if available)');
    console.log('   Option 2: Patch SDK to catch POI errors');
    console.log('   Option 3: Fix POI node configuration');
  } else {
    console.log('⚠️ Results mixed - need further investigation');
    console.log(`   POI Node: ${poiFailed ? '❌ Failed' : '✅ OK'}`);
    console.log(`   GraphQL: ${graphQLWorks ? '✅ Works' : '❌ Failed'}`);
    console.log(`   Tree Status: ${treeEmpty ? '❌ Empty' : '✅ Has data'}`);
  }

  return results;
}

// Make it available globally for easy testing
if (typeof window !== 'undefined') {
  window.testTXIDSyncSolutions = testTXIDSyncSolutions;
}




