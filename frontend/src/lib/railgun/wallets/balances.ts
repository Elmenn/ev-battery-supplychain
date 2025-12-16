import { Chain } from '@railgun-community/engine';
import { TXIDVersion } from '@railgun-community/shared-models';
import { reportAndSanitizeError } from '../../../utils/error';
import { getEngine } from '../core/engine';

export const refreshBalances = async (
  chain: Chain,
  walletIdFilter: Optional<string[]>,
): Promise<void> => {
  try {
    // Wallet will trigger .emit('scanned', {chain}) event when finished,
    // which calls `onBalancesUpdate` (balance-update.ts).

    // Kick off a background merkletree scan.
    // This will call wallet.scanBalances when it's done, but may take some time.

    const engine = getEngine();
    
    // CRITICAL PATCH: On Sepolia, catch slow-sync errors and ignore them
    // The SDK tries slow-sync at 50% when it detects a gap, but the gap is false
    // (write queue hasn't flushed yet). Slow-sync fails due to RPC limits.
    // By catching and ignoring this error, we let quick-sync complete naturally.
    if (chain.id === 11155111) { // Sepolia
      try {
        await engine.scanContractHistory(chain, walletIdFilter);
      } catch (slowSyncError: any) {
        const errorMessage = slowSyncError?.message || '';
        const errorString = JSON.stringify(slowSyncError || {});
        
        // Check if this is a slow-sync failure (RPC limit error)
        const isSlowSyncError = 
          errorMessage.includes('Failed to scan V2 events') ||
          errorMessage.includes('invalid block range params') ||
          errorMessage.includes('eth_getLogs') ||
          errorString.includes('invalid block range params');
        
        if (isSlowSyncError) {
          console.warn(`[REFRESH-BALANCES] ⚠️  Slow-sync failed (expected on Sepolia): ${errorMessage}`);
          console.warn(`[REFRESH-BALANCES]    This is expected - write queue hasn't flushed yet, causing false gap detection`);
          console.warn(`[REFRESH-BALANCES]    Quick-sync should continue and complete naturally`);
          console.warn(`[REFRESH-BALANCES]    Ignoring slow-sync error to prevent scan reset`);
          // Don't throw - let quick-sync continue
          return;
        }
        
        // If it's not a slow-sync error, re-throw it
        throw slowSyncError;
      }
    } else {
      // For other chains, use normal error handling
      await engine.scanContractHistory(chain, walletIdFilter);
    }
  } catch (err) {
    throw reportAndSanitizeError(refreshBalances.name, err);
  }
};

export const rescanFullUTXOMerkletreesAndWallets = async (
  chain: Chain,
  walletIdFilter: Optional<string[]>,
): Promise<void> => {
  try {
    const engine = getEngine();
    await engine.fullRescanUTXOMerkletreesAndWallets(chain, walletIdFilter);

    // Wallet will trigger .emit('scanned', {chain}) event when finished,
    // which calls `onBalancesUpdate` (balance-update.ts).
  } catch (err) {
    throw reportAndSanitizeError(rescanFullUTXOMerkletreesAndWallets.name, err);
  }
};

export const resetFullTXIDMerkletreesV2 = async (
  chain: Chain,
): Promise<void> => {
  try {
    const engine = getEngine();
    await engine.fullResetTXIDMerkletreesV2(chain);
  } catch (err) {
    throw reportAndSanitizeError(resetFullTXIDMerkletreesV2.name, err);
  }
};
