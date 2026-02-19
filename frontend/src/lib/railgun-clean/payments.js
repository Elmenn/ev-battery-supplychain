// Minimal payments helper for client-side wallet flow
// Exports: paySellerV2(paymentData), checkWalletState(eoa)

import { privateTransfer } from './operations/transfer';

// Backend API no longer used - all operations are client-side via SDK

/**
 * paySellerV2: perform client-side private transfer using SDK, with progress callbacks.
 * Delegates to privateTransfer from operations/transfer.js which implements the 3-step SDK flow.
 * params: { sellerRailgunAddress, amountWei, tokenAddress, productId, onProgress }
 */
export async function paySellerV2(params = {}) {
  const { sellerRailgunAddress, amountWei, tokenAddress, productId, onProgress } = params;

  console.log('[paySellerV2] Received params:', { sellerRailgunAddress, amountWei, tokenAddress, productId });

  try {
    onProgress?.({ step: 'prepare', message: 'Preparing private transaction...' });

    console.log('[paySellerV2] Calling privateTransfer with toRailgunAddress:', sellerRailgunAddress);

    const result = await privateTransfer({
      toRailgunAddress: sellerRailgunAddress,
      amountWei,
      tokenAddress,
      productId,
      onProgress
    });

    if (!result.success) {
      throw new Error(result.error || 'Transfer failed');
    }

    // Audit record stored locally (backend deprecated)
    console.log('[payments] Transfer audit:', {
      productId,
      txHash: result.txHash,
      memoHash: result.memoHash,
      railgunTxRef: result.railgunTxRef,
      timestamp: Date.now()
    });

    onProgress?.({ step: 'complete', message: 'Payment completed successfully!' });

    return {
      success: true,
      txHash: result.txHash,
      memoHash: result.memoHash,
      railgunTxRef: result.railgunTxRef
    };

  } catch (err) {
    console.error('Payment failed:', err);
    onProgress?.({ step: 'error', message: String(err.message || err) });
    return { success: false, error: String(err.message || err) };
  }
}

export async function checkWalletState(eoaAddress) {
  if (!eoaAddress) throw new Error('eoaAddress required');
  try {
    // Check localStorage for wallet info (client-side SDK storage)
    const stored = localStorage.getItem('railgun.wallet');
    if (stored) {
      const walletData = JSON.parse(stored);
      if (walletData?.walletID && walletData?.railgunAddress) {
        return {
          success: true,
          data: {
            walletID: walletData.walletID,
            railgunAddress: walletData.railgunAddress
          }
        };
      }
    }
    // No wallet found in localStorage
    return { success: false, error: 'No Railgun wallet connected' };
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}

const railgunPaymentsApi = { paySellerV2, checkWalletState };

export default railgunPaymentsApi;
