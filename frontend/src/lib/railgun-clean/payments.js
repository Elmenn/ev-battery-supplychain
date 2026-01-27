// Minimal payments helper for client-side wallet flow
// Exports: paySellerV2(paymentData), checkWalletState(eoa)

import { privateTransfer } from './operations/transfer';

const API = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RAILGUN_API_URL) || 'http://localhost:3001';

/**
 * paySellerV2: perform client-side private transfer using SDK, with progress callbacks.
 * Delegates to privateTransfer from operations/transfer.js which implements the 3-step SDK flow.
 * params: { sellerRailgunAddress, amountWei, tokenAddress, productId, onProgress }
 */
export async function paySellerV2(params = {}) {
  const { sellerRailgunAddress, amountWei, tokenAddress, productId, onProgress } = params;

  try {
    onProgress?.({ step: 'prepare', message: 'Preparing private transaction...' });

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

    // Record public metadata on backend if endpoint exists (best-effort)
    try {
      await fetch(`${API}/api/railgun/private-transfer-audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productId,
          txHash: result.txHash,
          memoHash: result.memoHash,
          railgunTxRef: result.railgunTxRef,
          timestamp: Date.now()
        })
      });
    } catch (e) {
      // ignore audit failures (backend may not be migrated yet)
      console.warn('Audit endpoint call failed:', e.message);
    }

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
    // Prefer SDK-based restore if available
    try {
      const client = await import('../railgun-client-browser.js');
      // Many SDKs provide restore/lookup APIs; if not, fall back to backend
      if (typeof client.restoreWallet === 'function') {
        return await client.restoreWallet(eoaAddress);
      }
    } catch (sdkErr) {
      // ignore
    }

    // Fallback: query backend for public wallet info
    const res = await fetch(`${API}/api/railgun/wallet-info?userAddress=${encodeURIComponent(eoaAddress)}`);
    const body = await res.json();
    return body;
  } catch (err) {
    return { success: false, error: String(err.message || err) };
  }
}

export default { paySellerV2, checkWalletState };
