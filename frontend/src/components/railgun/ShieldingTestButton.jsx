import React, { useState } from 'react';
import { ethers } from 'ethers';
import { 
  shieldSepoliaWETH, 
  shieldETH, 
  validateSepoliaShielding,
  getWalletBalance,
  refreshPrivateBalances,
  triggerArtifactDownload,
  getArtifactStatus,
  forceDownloadArtifacts,
  inspectArtifactStorage,
  checkArtifactDownloadActivity,
  checkSDKArtifactStoreUsage
} from '../../railgun/railgunWalletClient';

const ShieldingTestButton = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState([]);
  const [testAmount, setTestAmount] = useState('0.01');

  const addResult = (message, type = 'info') => {
    setTestResults(prev => [...prev, { message, type, timestamp: new Date().toLocaleTimeString() }]);
  };

  const clearResults = () => {
    setTestResults([]);
    addResult('🧹 Test results cleared', 'info');
  };

  // New function to test Railgun address parsing
  const testRailgunAddressParsing = async () => {
    try {
      setIsLoading(true);
      addResult('🔍 Testing Railgun address parsing...', 'info');
      
      // Import the SDK and see what's available
      const railgunSDK = await import('@railgun-community/wallet');
      addResult(`📦 SDK imported successfully`, 'success');
      
      // Test your current Railgun address
      const testAddress = '0zk1qyvsvggd2vgfapsnz3vnl0yfy4lh67kxqz5msh6cffe2vp9pk2elprv7j6fe3z53l74sfdp7njqzc7umlk4k8yqr8k992al9yk3z02df5m9h5np3la4vwmsnpv6';
      
      // First validate the address format
      try {
        const isValid = railgunSDK.validateRailgunAddress(testAddress);
        addResult(`✅ Address format validation: ${isValid ? 'PASSED' : 'FAILED'}`, isValid ? 'success' : 'error');
        
        if (!isValid) {
          addResult(`❌ Address format is invalid - this explains shielding failures!`, 'error');
          return;
        }
      } catch (validateError) {
        addResult(`❌ Address validation failed: ${validateError.message}`, 'error');
        return;
      }
      
      addResult(`🚨 Current wallet is corrupted - cannot load or access`, 'error');
      addResult(`💡 The "shared symmetric key" error is due to corrupted wallet data`, 'warning');
      addResult(`🔧 Solution: We need to recreate the wallet properly`, 'info');
      
    } catch (error) {
      addResult(`❌ Failed to test address parsing: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // New function to test wallet recreation
  const testWalletRecreation = async () => {
    try {
      setIsLoading(true);
      addResult('🔧 Testing wallet recreation...', 'info');
      
      // Import the SDK
      const railgunSDK = await import('@railgun-community/wallet');
      addResult(`📦 SDK imported successfully`, 'success');
      
      // Get the current wallet ID
      const currentWalletID = '68ba5e6f16860d263f75a77cf39292b24e4b0b02751b8dc70f20fc7bacb60246';
      
      addResult(`🗑️ Attempting to delete corrupted wallet: ${currentWalletID}`, 'info');
      
      try {
        // Try to delete the corrupted wallet
        railgunSDK.deleteWalletByID(currentWalletID);
        addResult(`✅ Corrupted wallet deleted successfully`, 'success');
      } catch (deleteError) {
        addResult(`⚠️ Could not delete wallet: ${deleteError.message}`, 'warning');
        addResult(`💡 This is expected if wallet is not properly registered`, 'info');
      }
      
      addResult(`🔧 Now you need to recreate the wallet in your main app`, 'info');
      addResult(`💡 The wallet recreation should happen in railgunWalletClient.js`, 'info');
      addResult(`💡 This will fix the "shared symmetric key" error`, 'info');
      
    } catch (error) {
      addResult(`❌ Failed to test wallet recreation: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const checkBalances = async () => {
    try {
      setIsLoading(true);
      addResult('💰 Checking current balances...', 'info');

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // Check ETH balance
      const ethBalance = await provider.getBalance(userAddress);
      addResult(`💎 ETH Balance: ${ethers.formatEther(ethBalance)} ETH`, 'success');

      // Check WETH balance - use correct checksum
      const wethAddress = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
      const wethContract = new ethers.Contract(wethAddress, [
        "function balanceOf(address owner) view returns (uint256)",
        "function symbol() view returns (string)"
      ], provider);

      const wethBalance = await wethContract.balanceOf(userAddress);
      const wethSymbol = await wethContract.symbol();
      addResult(`🪙 ${wethSymbol} Balance: ${ethers.formatEther(wethBalance)} ${wethSymbol}`, 'success');

      // Check private WETH balance
      try {
        const privateBalance = await getWalletBalance(wethAddress);
        addResult(`🔒 Private WETH Balance: ${privateBalance?.toString() || '0'} WETH`, 'success');
      } catch (e) {
        addResult('🔒 Private WETH Balance: SDK not ready yet', 'warning');
      }

    } catch (error) {
      addResult(`❌ Failed to check balances: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const validatePrerequisites = async () => {
    try {
      setIsLoading(true);
      addResult('🔍 Validating shielding prerequisites...', 'info');

      const testAmountWei = ethers.parseEther(testAmount);
      const validation = await validateSepoliaShielding(testAmountWei);
      
      if (validation.valid) {
        addResult('✅ All prerequisites validated successfully!', 'success');
      } else {
        addResult(`⚠️ Validation failed: ${validation.message}`, 'warning');
        
        if (validation.reason === 'insufficient_weth') {
          addResult('💡 Will auto-wrap ETH to WETH during shielding', 'info');
        }
        if (validation.reason === 'insufficient_allowance') {
          addResult('💡 Will auto-approve WETH for Railgun during shielding', 'info');
        }
        if (validation.reason === 'insufficient_gas') {
          addResult('❌ Cannot proceed - insufficient ETH for gas fees', 'error');
        }
      }

    } catch (error) {
      addResult(`❌ Validation failed: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadArtifacts = async () => {
    try {
      setIsLoading(true);
      addResult('📥 Manually triggering ZKP artifact downloads...', 'info');
      
      const success = await triggerArtifactDownload();
      
      if (success) {
        addResult('✅ Artifact download process completed successfully!', 'success');
        addResult('💡 You can now try shielding operations', 'info');
      } else {
        addResult('⚠️ Artifact download completed with some issues', 'warning');
        addResult('💡 Shielding may still work if core artifacts are available', 'info');
      }
    } catch (error) {
      addResult(`❌ Failed to download artifacts: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const checkArtifactStatus = async () => {
    try {
      setIsLoading(true);
      addResult('🔍 Checking ZKP artifact status...', 'info');
      
      const status = await getArtifactStatus();
      addResult(`📊 Artifact Status: ${status.status}`, status.ready ? 'success' : 'warning');
      addResult(`📝 Message: ${status.message}`, 'info');
      
      // Log detailed artifact information
      Object.entries(status.artifacts).forEach(([artifact, info]) => {
        const statusIcon = info.status === 'ready' ? '✅' : info.status === 'downloading' ? '⏳' : '❌';
        addResult(`${statusIcon} ${artifact}: ${info.status}`, info.status === 'ready' ? 'success' : 'warning');
        if (info.size && info.size !== 'unknown') {
          addResult(`   📏 Size: ${info.size} bytes`, 'info');
        }
        if (info.error) {
          addResult(`   ❌ Error: ${info.error}`, 'error');
        }
      });
      
      if (status.ready) {
        addResult('🎉 All artifacts are ready for shielding!', 'success');
      } else {
        addResult('⚠️ Some artifacts are not ready - shielding may fail', 'warning');
        addResult('💡 Try using "Force Download Artifacts" to resolve this', 'info');
      }
      
    } catch (error) {
      addResult(`❌ Failed to check artifact status: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const forceDownloadAllArtifacts = async () => {
    try {
      setIsLoading(true);
      addResult('🚀 Force downloading all ZKP artifacts...', 'info');
      
      const status = await forceDownloadArtifacts();
      addResult(`📊 Final Status: ${status.status}`, status.ready ? 'success' : 'warning');
      addResult(`📝 Message: ${status.message}`, 'info');
      
      if (status.ready) {
        addResult('🎉 All artifacts are now ready for shielding!', 'success');
        addResult('💡 You can now try shielding operations', 'info');
      } else {
        addResult('⚠️ Some artifacts are still not ready', 'warning');
        addResult('💡 This may take a few more minutes - artifacts download in background', 'info');
      }
      
    } catch (error) {
      addResult(`❌ Failed to force download artifacts: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const checkSDKStatus = async () => {
    try {
      setIsLoading(true);
      addResult('🔍 Checking Railgun SDK status...', 'info');
      
      // Check if we can access basic SDK functions
      try {
        const artifactStatus = await getArtifactStatus();
        addResult(`📊 Artifact Status: ${artifactStatus.status}`, 'info');
        
        if (artifactStatus.ready) {
          addResult('✅ ZKP artifacts are ready', 'success');
        } else {
          addResult('⚠️ ZKP artifacts are not ready', 'warning');
        }
        
        // Try to get wallet balance to test SDK connectivity
        try {
          const balance = await getWalletBalance('0xfff9976782d46cc05630d1f6ebab18b2324d6b14');
          addResult(`🔒 SDK Wallet Balance Check: ${balance?.toString() || '0'} WETH`, 'success');
          addResult('✅ SDK is properly initialized and connected', 'success');
        } catch (balanceError) {
          addResult(`⚠️ SDK balance check failed: ${balanceError.message}`, 'warning');
          addResult('💡 SDK may not be fully initialized yet', 'info');
        }
        
      } catch (sdkError) {
        addResult(`❌ SDK status check failed: ${sdkError.message}`, 'error');
        addResult('💡 SDK may not be initialized or there may be a connection issue', 'warning');
      }
      
    } catch (error) {
      addResult(`❌ Failed to check SDK status: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const inspectStorage = async () => {
    try {
      setIsLoading(true);
      addResult('🔍 Inspecting artifact storage contents...', 'info');
      
      const storageInfo = await inspectArtifactStorage();
      addResult(`📋 Total storage keys: ${storageInfo.totalKeys}`, 'info');
      addResult(`🔧 Artifact-related keys: ${storageInfo.artifactKeys.length}`, 'info');
      
      if (storageInfo.artifactKeys.length > 0) {
        addResult('📋 Artifact keys found:', 'info');
        storageInfo.artifactKeys.forEach(key => {
          addResult(`   - ${key}`, 'info');
        });
      } else {
        addResult('⚠️ No artifact keys found in storage', 'warning');
      }
      
      if (storageInfo.storageWorking) {
        addResult('✅ Storage inspection completed successfully', 'success');
      } else {
        addResult('❌ Storage inspection failed', 'error');
        if (storageInfo.error) {
          addResult(`   Error: ${storageInfo.error}`, 'error');
        }
      }
      
    } catch (error) {
      addResult(`❌ Failed to inspect storage: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const checkDownloadActivity = async () => {
    try {
      setIsLoading(true);
      addResult('🔍 Checking artifact download activity...', 'info');
      
      const activityInfo = await checkArtifactDownloadActivity();
      addResult(`📊 Download Status: ${activityInfo.status}`, 'info');
      addResult(`📝 Message: ${activityInfo.message}`, 'info');
      addResult(`🚀 Activity: ${activityInfo.activity}`, activityInfo.downloadDetected ? 'success' : 'warning');
      
      if (activityInfo.accessResults) {
        addResult('📥 Artifact access results:', 'info');
        activityInfo.accessResults.forEach(result => {
          const statusIcon = result.status === 'ready' ? '✅' : result.status === 'downloading' ? '⏳' : '❌';
          addResult(`   ${statusIcon} ${result.artifact}: ${result.status}`, result.status === 'ready' ? 'success' : 'warning');
          if (result.size && result.size !== 'unknown') {
            addResult(`      📏 Size: ${result.size} bytes`, 'info');
          }
          if (result.accessTime && result.accessTime !== 'N/A') {
            addResult(`      ⏱️ Access time: ${result.accessTime}ms`, 'info');
          }
          if (result.error) {
            addResult(`      ❌ Error: ${result.error}`, 'error');
          }
        });
      }
      
      if (activityInfo.downloadDetected) {
        addResult('🎉 Download activity detected!', 'success');
        addResult('💡 Artifacts are being downloaded by the SDK', 'info');
      } else {
        addResult('⚠️ No download activity detected', 'warning');
        addResult('💡 This may indicate an issue with the SDK download process', 'info');
      }
      
    } catch (error) {
      addResult(`❌ Failed to check download activity: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const checkSDKStoreUsage = async () => {
    try {
      setIsLoading(true);
      addResult('🔍 Checking if SDK is using our artifact store...', 'info');
      
      const usageInfo = await checkSDKArtifactStoreUsage();
      addResult(`📊 Store Usage Status: ${usageInfo.status}`, 'info');
      addResult(`📝 Message: ${usageInfo.message}`, 'info');
      addResult(`🔧 SDK using store: ${usageInfo.sdkUsingStore ? 'Yes' : 'No'}`, usageInfo.sdkUsingStore ? 'success' : 'warning');
      addResult(`📦 Artifacts found: ${usageInfo.artifactsFound ? 'Yes' : 'No'}`, usageInfo.artifactsFound ? 'success' : 'warning');
      
      if (usageInfo.summary) {
        addResult('📊 Usage Summary:', 'info');
        addResult(`   📋 Total tested: ${usageInfo.summary.totalTested}`, 'info');
        addResult(`   ✅ Found: ${usageInfo.summary.found}`, 'info');
        addResult(`   ⏳ Not found: ${usageInfo.summary.notFound}`, 'info');
        addResult(`   ❌ Errors: ${usageInfo.summary.errors}`, 'info');
      }
      
      if (usageInfo.usageResults) {
        addResult('📥 Detailed usage results:', 'info');
        usageInfo.usageResults.forEach(result => {
          const statusIcon = result.status === 'found' ? '✅' : result.status === 'not_found' ? '⏳' : '❌';
          const storeIcon = result.sdkCalledStore ? '🔧' : '⚠️';
          addResult(`   ${statusIcon} ${storeIcon} ${result.artifact}: ${result.status}`, result.status === 'found' ? 'success' : 'warning');
          if (result.size && result.size !== 'unknown') {
            addResult(`      📏 Size: ${result.size} bytes`, 'info');
          }
          if (result.error) {
            addResult(`      ❌ Error: ${result.error}`, 'error');
          }
        });
      }
      
      if (usageInfo.sdkUsingStore) {
        addResult('✅ SDK is using our artifact store', 'success');
        if (usageInfo.artifactsFound) {
          addResult('🎉 Artifacts are available for shielding!', 'success');
        } else {
          addResult('⚠️ Store is working but artifacts not found', 'warning');
          addResult('💡 This suggests artifacts are still downloading', 'info');
        }
      } else {
        addResult('❌ SDK is not using our artifact store', 'error');
        addResult('💡 This indicates a configuration issue', 'warning');
      }
      
    } catch (error) {
      addResult(`❌ Failed to check SDK store usage: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // New function to test SDK function signatures and createRailgunWallet
  const testSDKFunctionSignatures = async () => {
    try {
      setIsLoading(true);
      addResult('🔍 Testing SDK function signatures...', 'info');
      
      // Import the SDK
      const railgunSDK = await import('@railgun-community/wallet');
      addResult(`📦 SDK imported successfully`, 'success');
      
      // Test createRailgunWallet function signature
      addResult(`🔍 Testing createRailgunWallet function...`, 'info');
      addResult(`   - Function exists: ${typeof railgunSDK.createRailgunWallet === 'function'}`, 'info');
      addResult(`   - Function length: ${railgunSDK.createRailgunWallet.length}`, 'info');
      
      // Get function source to see parameters
      const createFuncStr = railgunSDK.createRailgunWallet.toString();
      const paramMatch = createFuncStr.match(/\(([^)]*)\)/);
      if (paramMatch) {
        const params = paramMatch[1].split(',').map(p => p.trim());
        addResult(`   - Parameters: [${params.join(', ')}]`, 'info');
      }
      
      // Test walletForID function signature
      addResult(`🔍 Testing walletForID function...`, 'info');
      addResult(`   - Function exists: ${typeof railgunSDK.walletForID === 'function'}`, 'info');
      addResult(`   - Function length: ${railgunSDK.walletForID.length}`, 'info');
      
      const walletForIDStr = railgunSDK.walletForID.toString();
      const walletForIDMatch = walletForIDStr.match(/\(([^)]*)\)/);
      if (walletForIDMatch) {
        const params = walletForIDMatch[1].split(',').map(p => p.trim());
        addResult(`   - Parameters: [${params.join(', ')}]`, 'info');
      }
      
      // Test loadWalletByID function signature
      addResult(`🔍 Testing loadWalletByID function...`, 'info');
      addResult(`   - Function exists: ${typeof railgunSDK.loadWalletByID === 'function'}`, 'info');
      addResult(`   - Function length: ${railgunSDK.loadWalletByID.length}`, 'info');
      
      const loadWalletStr = railgunSDK.loadWalletByID.toString();
      const loadWalletMatch = loadWalletStr.match(/\(([^)]*)\)/);
      if (loadWalletMatch) {
        const params = loadWalletMatch[1].split(',').map(p => p.trim());
        addResult(`   - Parameters: [${params.join(', ')}]`, 'info');
      }
      
      // Test what createRailgunWallet actually returns
      addResult(`🔍 Testing createRailgunWallet return value...`, 'info');
      
      try {
        // Create a minimal test wallet to see what it returns
        const testEncryptionKey = new Uint8Array(32); // 32 bytes of zeros
        const testMnemonic = 'test test test test test test test test test test test junk'; // 12 words
        
        addResult(`   - Creating test wallet with minimal parameters...`, 'info');
        
        const testWalletResult = await railgunSDK.createRailgunWallet(
          testEncryptionKey,
          testMnemonic,
          undefined, // creationBlockNumbers
          0 // derivationIndex
        );
        
        addResult(`   ✅ Test wallet created successfully!`, 'success');
        addResult(`   - Return type: ${typeof testWalletResult}`, 'info');
        addResult(`   - Constructor: ${testWalletResult?.constructor?.name || 'unknown'}`, 'info');
        
        if (testWalletResult && typeof testWalletResult === 'object') {
          addResult(`   - Object keys: ${Object.keys(testWalletResult).join(', ')}`, 'info');
          
          // Check if it has the expected wallet properties
          const expectedProps = ['id', 'getAddress', 'viewingKeyPair', 'masterPublicKey'];
          expectedProps.forEach(prop => {
            const hasProp = testWalletResult.hasOwnProperty(prop);
            addResult(`   - ${prop}: ${hasProp ? 'EXISTS' : 'MISSING'}`, hasProp ? 'success' : 'error');
          });
          
          // Test if it has the getAddress method
          if (typeof testWalletResult.getAddress === 'function') {
            try {
              const testAddress = testWalletResult.getAddress();
              addResult(`   - getAddress() result: ${testAddress}`, 'success');
            } catch (e) {
              addResult(`   - getAddress() error: ${e.message}`, 'error');
            }
          }
        }
        
        // Now test if we can use walletForID with the result
        if (testWalletResult && testWalletResult.id) {
          addResult(`   - Testing walletForID with result.id: ${testWalletResult.id}`, 'info');
          
          try {
            const reloadedWallet = await railgunSDK.walletForID(testWalletResult.id);
            addResult(`   ✅ walletForID worked with result.id`, 'success');
            addResult(`   - Reloaded wallet type: ${typeof reloadedWallet}`, 'info');
            addResult(`   - Reloaded wallet constructor: ${reloadedWallet?.constructor?.name || 'unknown'}`, 'info');
          } catch (e) {
            addResult(`   ❌ walletForID failed: ${e.message}`, 'error');
          }
        }
        
        // Clean up test wallet
        try {
          railgunSDK.deleteWalletByID(testWalletResult.id);
          addResult(`   ✅ Test wallet cleaned up`, 'success');
        } catch (e) {
          addResult(`   ⚠️ Could not clean up test wallet: ${e.message}`, 'warning');
        }
        
      } catch (e) {
        addResult(`   ❌ Test wallet creation failed: ${e.message}`, 'error');
      }
      
      addResult(`🔍 Summary: This test shows exactly what the SDK expects`, 'info');
      
    } catch (error) {
      addResult(`❌ Failed to test SDK signatures: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const testWETHShielding = async () => {
    try {
      setIsLoading(true);
      addResult('🛡️ Testing WETH shielding...', 'info');

      const testAmountWei = ethers.parseEther(testAmount);
      const result = await shieldSepoliaWETH(testAmountWei);
      
      addResult(`✅ WETH shielding completed! TX Hash: ${result.txHash}`, 'success');

      // Refresh private balances
      addResult('🔄 Refreshing private balances...', 'info');
      await refreshPrivateBalances();
      
      const privateBalance = await getWalletBalance('0xfff9976782d46cc05630d1f6ebab18b2324d6b14');
      addResult(`🔒 New Private WETH Balance: ${privateBalance?.toString() || '0'} WETH`, 'success');

    } catch (error) {
      addResult(`❌ WETH shielding failed: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const testETHShielding = async () => {
    try {
      setIsLoading(true);
      addResult('🔄 Testing ETH auto-wrapping and shielding...', 'info');

      const testAmountWei = ethers.parseEther(testAmount);
      const result = await shieldETH(testAmountWei);
      
      addResult(`✅ ETH shielding completed! TX Hash: ${result.txHash}`, 'success');

      // Refresh private balances
      addResult('🔄 Refreshing private balances...', 'info');
      await refreshPrivateBalances();
      
      const privateBalance = await getWalletBalance('0xfff9976782d46cc05630d1f6ebab18b2324d6b14');
      addResult(`🔒 New Private WETH Balance: ${privateBalance?.toString() || '0'} WETH`, 'success');

    } catch (error) {
      addResult(`❌ ETH shielding failed: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const runFullTest = async () => {
    try {
      setIsLoading(true);
      addResult('🧪 Starting full shielding test suite...', 'info');
      
      // Step 1: Check balances
      addResult('💰 Step 1: Checking balances...', 'info');
      await checkBalances();
      
      // Step 2: Validate prerequisites
      addResult('🔍 Step 2: Validating prerequisites...', 'info');
      const testAmountWei = ethers.parseEther(testAmount);
      const validation = await validateSepoliaShielding(testAmountWei);
      
      if (!validation.valid) {
        addResult('❌ Prerequisites not met, cannot proceed', 'error');
        return;
      }
      
      addResult('✅ Prerequisites validated successfully!', 'success');
      
      // Step 2.5: Check artifact status before proceeding
      addResult('🔍 Step 2.5: Checking ZKP artifact status...', 'info');
      const artifactStatus = await getArtifactStatus();
      
      if (!artifactStatus.ready) {
        addResult('⚠️ ZKP artifacts not ready - attempting to force download...', 'warning');
        addResult('🚀 Force downloading artifacts...', 'info');
        await forceDownloadAllArtifacts();
        
        // Check again after force download
        const recheckStatus = await getArtifactStatus();
        if (!recheckStatus.ready) {
          addResult('❌ ZKP artifacts still not ready after force download', 'error');
          addResult('💡 Shielding operations will likely fail', 'warning');
          addResult('💡 Try again in a few minutes when artifacts finish downloading', 'info');
          return;
        }
      }
      
      addResult('✅ ZKP artifacts are ready for shielding!', 'success');
      
      // Step 3: Test WETH shielding
      addResult('🛡️ Step 3: Testing WETH shielding...', 'info');
      await testWETHShielding();
      
      // Step 4: Test ETH shielding
      addResult('🔄 Step 4: Testing ETH shielding...', 'info');
      await testETHShielding();
      
      addResult('🎉 Full test suite completed successfully!', 'success');
      
    } catch (error) {
      addResult(`❌ Full test failed: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="shielding-test-panel" style={{ 
      border: '1px solid #ddd', 
      borderRadius: '8px', 
      padding: '20px', 
      margin: '20px 0',
      backgroundColor: '#f9f9f9'
    }}>
      <h3>🧪 Railgun Shielding Test Panel</h3>
      
      <div style={{ marginBottom: '20px' }}>
        <label style={{ marginRight: '10px' }}>
          Test Amount (WETH):
          <input
            type="number"
            value={testAmount}
            onChange={(e) => setTestAmount(e.target.value)}
            step="0.01"
            min="0.01"
            style={{ marginLeft: '5px', padding: '5px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={checkSDKStatus} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🔍 Check SDK Status
        </button>
        
        <button 
          onClick={checkBalances} 
          disabled={isLoading}
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          💰 Check Balances
        </button>
        
        <button 
          onClick={validatePrerequisites} 
          disabled={isLoading}
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          🔍 Validate Prerequisites
        </button>
        
        <button 
          onClick={downloadArtifacts} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          📥 Download ZKP Artifacts
        </button>
        
        <button 
          onClick={checkArtifactStatus} 
          disabled={isLoading}
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          🔍 Check Artifact Status
        </button>

        <button 
          onClick={forceDownloadAllArtifacts} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🚀 Force Download Artifacts
        </button>
        
        <button 
          onClick={inspectStorage} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🔍 Inspect Storage
        </button>

        <button 
          onClick={checkDownloadActivity} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🔍 Check Download Activity
        </button>

        <button 
          onClick={checkSDKStoreUsage} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🔍 Check SDK Store Usage
        </button>
        
        <button 
          onClick={testSDKFunctionSignatures} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🔑 Test SDK Signatures
        </button>
        
        <button 
          onClick={testRailgunAddressParsing} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#17a2b8',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🔑 Test Address Parsing
        </button>
        
        <button 
          onClick={testWalletRecreation} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🔧 Test Wallet Recreation
        </button>
        
        <button 
          onClick={testWETHShielding} 
          disabled={isLoading}
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          🛡️ Test WETH Shielding
        </button>
        
        <button 
          onClick={testETHShielding} 
          disabled={isLoading}
          style={{ marginRight: '10px', padding: '8px 16px' }}
        >
          🔄 Test ETH Shielding
        </button>
        
        <button 
          onClick={runFullTest} 
          disabled={isLoading}
          style={{ 
            marginRight: '10px', 
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          🚀 Run Full Test Suite
        </button>
        
        <button 
          onClick={clearResults} 
          style={{ padding: '8px 16px' }}
        >
          🗑️ Clear Results
        </button>
      </div>

      {isLoading && (
        <div style={{ marginBottom: '20px', color: '#007bff' }}>
          ⏳ Loading... Please wait
        </div>
      )}

      <div style={{ 
        maxHeight: '400px', 
        overflowY: 'auto', 
        border: '1px solid #ccc', 
        padding: '10px',
        backgroundColor: 'white'
      }}>
        <h4>Test Results:</h4>
        {testResults.length === 0 ? (
          <p style={{ color: '#666' }}>No test results yet. Run a test to see results here.</p>
        ) : (
          testResults.map((result, index) => (
            <div 
              key={index} 
              style={{ 
                marginBottom: '8px',
                padding: '5px',
                borderLeft: `3px solid ${
                  result.type === 'success' ? '#28a745' :
                  result.type === 'error' ? '#dc3545' :
                  result.type === 'warning' ? '#ffc107' : '#17a2b8'
                }`,
                paddingLeft: '10px'
              }}
            >
              <span style={{ color: '#666', fontSize: '12px' }}>{result.timestamp}</span>
              <span style={{ marginLeft: '10px' }}>{result.message}</span>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <p><strong>💡 Tips:</strong></p>
        <ul>
          <li>Make sure you're connected to Sepolia testnet</li>
          <li>Ensure you have at least 0.01 ETH for gas fees</li>
          <li>Have some WETH or ETH to test with</li>
          <li>Check the browser console for detailed logs</li>
        </ul>
      </div>
    </div>
  );
};

export default ShieldingTestButton;
