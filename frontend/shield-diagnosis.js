// Diagnostic script for ShieldPending issue
// Run this in browser console after a shield transaction

async function diagnoseShieldPending() {
  console.log('🔍 Starting ShieldPending diagnosis...');
  
  // Get current wallet info
  const walletID = localStorage.getItem('railgun.wallet');
  if (!walletID) {
    console.error('❌ No wallet found in localStorage');
    return;
  }
  
  const walletData = JSON.parse(walletID);
  console.log('🔍 Wallet ID:', walletData.walletID);
  
  // Import Wallet from the SDK
  const { Wallet } = await import('@railgun-community/wallet');
  const { NetworkName, TXIDVersion } = await import('@railgun-community/shared-models');
  
  const sepolia = { type: 0, id: 11155111 };
  const wethAddress = '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';
  
  try {
    // 1) Get wallet and address
    const wallet = await Wallet.walletForID(walletData.walletID);
    const railgunAddress = await wallet.getAddress();
    console.log('🔍 Railgun address:', railgunAddress);
    
    // 2) Wait for wallet scan to finish
    console.log('⏳ Waiting for wallet scan...');
    await Wallet.awaitWalletScan(sepolia);
    console.log('✅ Wallet scan complete');
    
    // 3) Try to reset TXID trees and resync
    console.log('🔄 Resetting TXID trees...');
    try {
      await Wallet.fullResetTXIDMerkletreesV2();
      console.log('✅ TXID trees reset');
    } catch (e) {
      console.warn('⚠️ TXID reset failed:', e.message);
    }
    
    // 4) Try quick sync
    console.log('🔄 Attempting quick sync...');
    try {
      await Wallet.quickSyncRailgunTransactionsV2(sepolia);
      console.log('✅ Quick sync complete');
    } catch (e) {
      console.warn('⚠️ Quick sync failed:', e.message);
    }
    
    // 5) Force full rescan
    console.log('🔄 Forcing full UTXO rescan...');
    await Wallet.rescanFullUTXOMerkletreesAndWallets(NetworkName.EthereumSepolia, [wallet]);
    await Wallet.awaitWalletScan(sepolia);
    console.log('✅ Full rescan complete');
    
    // 6) Refresh balances
    console.log('🔄 Refreshing balances...');
    await Wallet.refreshBalances(sepolia, [walletData.walletID]);
    console.log('✅ Balances refreshed');
    
    // 7) Get serialized balances
    console.log('🔍 Getting serialized balances...');
    const allBalances = await Wallet.getSerializedERC20Balances(railgunAddress, sepolia);
    console.log('💰 All balance buckets:', Object.keys(allBalances));
    
    const spendableWeth = allBalances.Spendable?.[wethAddress.toLowerCase()]?.balanceString || '0';
    const pendingWeth = allBalances.ShieldPending?.[wethAddress.toLowerCase()]?.balanceString || '0';
    
    console.log('💰 Spendable WETH:', spendableWeth);
    console.log('💰 Pending WETH:', pendingWeth);
    
    // 8) Check TXID tree status
    console.log('🔍 Checking TXID tree status...');
    const engine = Wallet.getEngine();
    const v2Tree = engine.txidMerkletrees?.v2Map?.get("0:11155111");
    const v3Tree = engine.txidMerkletrees?.v3Map?.get("0:11155111");
    
    console.log('📊 TXID V2 tree:', v2Tree ? 'exists' : 'missing');
    console.log('📊 TXID V3 tree:', v3Tree ? 'exists' : 'missing');
    
    if (v2Tree) {
      console.log('📊 V2 tree length:', v2Tree.treeLengths?.[0] || 'unknown');
    }
    
    console.log('✅ Diagnosis complete');
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  }
}

// Run the diagnosis
diagnoseShieldPending();
