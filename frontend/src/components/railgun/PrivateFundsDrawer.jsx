// src/components/railgun/PrivateFundsDrawer.jsx
import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';
import { fmt18 } from '../../helpers/format';
import {
  setSignerAndProvider,
  setRailgunIdentity,
  getAllBalances,
  wrapETHtoWETH,
  estimateShieldWETH,
  shieldWETH
} from '../../lib/railgun-clean';

export default function PrivateFundsDrawer({ open, onClose }) {
  const [balances, setBalances] = useState(null);
  const [wrapAmt, setWrapAmt] = useState('0.01');
  const [shieldAmt, setShieldAmt] = useState('0.01');
  const [estimating, setEstimating] = useState(false);
  const [shielding, setShielding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function refreshBalances() {
    try {
      setBusy(true);
      
      // Check if we have a provider and signer
      if (!window.ethereum) {
        throw new Error('MetaMask not connected');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Set the provider and signer in railgunClient (functions imported at top)
      setSignerAndProvider(provider, signer);
      console.log('🔧 Provider/signer set in railgunClient');
      
      // ✅ Check for existing Railgun connection and set global state
      const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
      if (stored && stored.walletID && stored.userAddress) {
        const currentUser = await signer.getAddress();
        const belongsToCurrentUser = stored.userAddress.toLowerCase() === currentUser.toLowerCase();
        const placeholderAddress = stored.railgunAddress || `0zk1q_dummy_${stored.walletID}`;

        if (belongsToCurrentUser) {
          console.log('🔧 Setting Railgun identity for balance checking:', placeholderAddress);
          setRailgunIdentity({
            walletID: stored.walletID,
            railgunAddress: placeholderAddress
          });
        } else {
          console.log('⚠️ Stored Railgun connection belongs to different user - skipping');
        }
      } else {
        console.log('⚠️ No Railgun connection found - EOA balances only');
      }
      
      // Now get all balances (EOA + Railgun)
      console.log('🔍 Calling getAllBalances...');
      const b = await getAllBalances();
      // getAllBalances returns { success, data }
      const payload = b?.success ? b.data : null;
      setBalances(payload);
      console.log('💰 Balances refreshed:', b);
    } catch (e) {
      console.error('❌ Failed to refresh balances:', e);
      setMsg(e.message);
      toast.error('Failed to refresh balances: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
  if (!open) return;

  // Chain guard
  if (window.ethereum?.chainId !== '0xaa36a7') {
    setMsg('Please switch MetaMask to Sepolia.');
    toast.error('Please switch MetaMask to Sepolia');
    return;
  }

  refreshBalances();

  const onChain = () => refreshBalances();
  const onAcct = () => refreshBalances();
  window.ethereum?.on?.('chainChanged', onChain);
  window.ethereum?.on?.('accountsChanged', onAcct);

  return () => {
    window.ethereum?.removeListener?.('chainChanged', onChain);
    window.ethereum?.removeListener?.('accountsChanged', onAcct);
  };
}, [open]);


  async function onWrap() {
    try {
      setMsg('');
      setBusy(true);
      console.log('🔄 Wrapping ETH to WETH...');
      
      // First ensure provider/signer are set
      if (!window.ethereum) {
        throw new Error('MetaMask not connected');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Set the provider/signer in railgunClient (functions imported at top)
      setSignerAndProvider(provider, signer);

      console.log('🔧 Provider/signer set, calling wrapETHtoWETH...');
      const result = await wrapETHtoWETH(wrapAmt);
      console.log('📦 Wrap result:', result);
      
      const { txHash } = result;
      setMsg(`✅ Wrapped: ${txHash}`);
      toast.success(`ETH wrapped to WETH! TX: ${txHash.slice(0, 10)}...`);
      
      await refreshBalances();
    } catch (e) {
      console.error('❌ Wrap failed:', e);
      setMsg(e.message);
      toast.error('Wrap failed: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onEstimate() {
  try {
    setMsg('');
    setEstimating(true);
    console.log('🔍 Estimating shield gas...');

    if (!window.ethereum) throw new Error('MetaMask not connected');

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    setSignerAndProvider(provider, signer);

    // ✅ PASS signer now
    const result = await estimateShieldWETH(shieldAmt, signer);

    if (result.success) {
      setMsg(`✅ Estimate ok: ${result.gasEstimate} wei`);
      toast.success(`Gas estimate: ${result.gasEstimate} wei`);
    } else {
      throw new Error(result.error || 'Gas estimation failed');
    }
  } catch (e) {
    console.error('❌ Estimate failed:', e);
    setMsg(e.message);
    toast.error('Estimate failed: ' + e.message);
  } finally {
    setEstimating(false);
  }
}


  async function onShield() {
  try {
    setMsg('');
    setShielding(true);
    console.log('🛡️ Shielding WETH to Railgun...');

    if (!window.ethereum) {
      throw new Error('MetaMask not connected');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    // Set the provider/signer in railgunClient
    setSignerAndProvider(provider, signer);

    // ✅ PASS signer into shieldWETH
    const result = await shieldWETH(shieldAmt, signer);

    if (result.success) {
      const explorerUrl = `https://sepolia.etherscan.io/tx/${result.txHash}`;
      setMsg(`Shielded: ${result.txHash}`);
      toast.success(
        <div>
          <p>WETH shielded successfully!</p>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-500 underline text-sm"
          >
            View on Etherscan
          </a>
        </div>,
        { duration: 5000 }
      );
      await refreshBalances();
    } else {
      throw new Error(result.error || 'Shield transaction failed');
    }
  } catch (e) {
    console.error('❌ Shield failed:', e);
    setMsg(e.message);
    toast.error('Shield failed: ' + e.message);
  } finally {
    setShielding(false);
  }
}


  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-900">Private Funds (Sepolia)</h3>
          <Button 
            onClick={onClose}
            variant="outline"
            size="sm"
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </Button>
        </div>

        {/* Balances Section */}
        <section className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-3">WETH Balances</h4>

          {/* Side-by-side WETH Balances */}
          <div className="flex gap-4 mb-4">
            {/* Public WETH */}
            <div className="flex-1 p-3 bg-white rounded-lg border border-gray-200">
              <span className="text-xs text-gray-500 uppercase tracking-wide">Public</span>
              <p className="font-mono text-lg">
                {busy ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  `${balances?.eoa?.weth ?? '0'} WETH`
                )}
              </p>
            </div>

            {/* Private WETH */}
            <div className="flex-1 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <span className="text-xs text-purple-500 uppercase tracking-wide">Private</span>
              <p className="font-mono text-lg text-purple-700">
                {busy ? (
                  <span className="animate-pulse">...</span>
                ) : (
                  `${fmt18(balances?.railgun?.weth)} WETH`
                )}
              </p>
              {balances?.railgun?.pendingWeth > 0n && (
                <p className="text-xs text-orange-500">
                  +{fmt18(balances?.railgun?.pendingWeth)} pending
                </p>
              )}
            </div>
          </div>

          {/* ETH Balance (for wrapping) */}
          <div className="text-sm text-gray-600 mb-2">
            ETH Balance: {busy ? '...' : (balances?.eoa?.eth ?? '0')} ETH
          </div>

          {balances?.railgunError && (
            <p className="text-xs text-red-500 mt-2">{balances.railgunError}</p>
          )}
          {busy && <p className="text-blue-600 text-sm mt-2">Refreshing...</p>}
        </section>

        {/* Wrap ETH → WETH Section */}
        <section className="mb-6 p-4 border border-gray-200 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-3">Wrap ETH → WETH</h4>
          <div className="space-y-3">
            <input
              type="number"
              value={wrapAmt}
              onChange={(e) => setWrapAmt(e.target.value)}
              placeholder="Amount in ETH"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              step="0.01"
              min="0.001"
            />
            <Button
              onClick={onWrap}
              disabled={busy || !wrapAmt || parseFloat(wrapAmt) <= 0}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
            >
              {busy ? 'Wrapping...' : 'Wrap ETH to WETH'}
            </Button>
          </div>
        </section>

        {/* Shield WETH → Railgun Section */}
        <section className="mb-6 p-4 border border-gray-200 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-3">Shield WETH → Railgun</h4>
          <div className="space-y-3">
            <input
              type="number"
              value={shieldAmt}
              onChange={(e) => setShieldAmt(e.target.value)}
              placeholder="Amount in WETH"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              step="0.01"
              min="0.001"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={onEstimate}
                disabled={estimating || !shieldAmt || parseFloat(shieldAmt) <= 0}
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                {estimating ? 'Estimating...' : 'Estimate Gas'}
              </Button>
              <Button
                onClick={onShield}
                disabled={shielding || !shieldAmt || parseFloat(shieldAmt) <= 0}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400"
              >
                {shielding ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Shielding WETH...
                  </>
                ) : (
                  'Shield WETH'
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* Status Messages */}
        {msg && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">{msg}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="text-center space-y-2">
          <div className="flex gap-2 justify-center flex-wrap">
            <Button
              onClick={refreshBalances}
              disabled={busy}
              variant="outline"
              size="sm"
              className="text-gray-600 hover:text-gray-800"
            >
              Refresh Balances
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

