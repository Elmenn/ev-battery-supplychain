// src/components/railgun/PrivateFundsDrawer.jsx
import React, { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import toast from 'react-hot-toast';
import { ethers } from 'ethers';
import { fmt18 } from '../../helpers/format';

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
      
      // Set the provider and signer in railgunClient
      // TODO: Update to use new Railgun structure
      const { setSignerAndProvider, setRailgunIdentity } = await import('../../lib/railgun-legacy-shim');
      setSignerAndProvider(provider, signer);
      console.log('🔧 Provider/signer set in railgunClient');
      
      // ✅ Check for existing Railgun connection and set global state
      const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
      if (stored && stored.walletID && stored.railgunAddress && stored.userAddress) {
        const currentUser = await signer.getAddress();
        const belongsToCurrentUser = stored.userAddress.toLowerCase() === currentUser.toLowerCase();
        
        if (belongsToCurrentUser) {
          console.log('🔧 Setting Railgun identity for balance checking:', stored.railgunAddress);
          setRailgunIdentity({
            walletID: stored.walletID,
            railgunAddress: stored.railgunAddress
          });
        } else {
          console.log('⚠️ Stored Railgun connection belongs to different user - skipping');
        }
      } else {
        console.log('⚠️ No Railgun connection found - EOA balances only');
      }
      
      // Now get all balances (EOA + Railgun)
      const { getAllBalances } = await import('../../lib/railgun-legacy-shim');
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
    
    // Force refresh balances when drawer opens
    refreshBalances();
    
    // Chain guard (hard fail early)
    if (window.ethereum?.chainId !== '0xaa36a7') { // Sepolia
      setMsg('Please switch MetaMask to Sepolia.');
      toast.error('Please switch MetaMask to Sepolia');
      return;
    }
    
    refreshBalances();
    
    // Refresh when chain/account changes
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
      
      // Set the provider/signer in railgunClient
      const { setSignerAndProvider } = await import('../../lib/railgun-legacy-shim');
      // TODO: Implement wrapETHtoWETH in new structure
      const wrapETHtoWETH = async () => { throw new Error('wrapETHtoWETH not yet implemented in new structure'); };
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
      
      // First, ensure provider/signer are set
      if (typeof window !== 'undefined' && window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // Set the provider/signer in railgunClient
        const { setSignerAndProvider } = await import('../../lib/railgun-legacy-shim');
        setSignerAndProvider(provider, signer);
      }
      
      // TODO: Implement estimateShieldWETH in new structure
      const estimateShieldWETH = async () => { throw new Error('estimateShieldWETH not yet implemented in new structure'); };
      const result = await estimateShieldWETH(shieldAmt);
      
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
      
      // First, ensure provider/signer are set
      if (typeof window !== 'undefined' && window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // Set the provider/signer in railgunClient
        const { setSignerAndProvider } = await import('../../lib/railgun-legacy-shim');
        setSignerAndProvider(provider, signer);
      }
      
      // TODO: Implement shieldWETH in new structure
      const shieldWETH = async () => { throw new Error('shieldWETH not yet implemented in new structure'); };
      const result = await shieldWETH(shieldAmt);
      
      if (result.success) {
        setMsg(`✅ Shielded: ${result.txHash}`);
        toast.success(`WETH shielded to Railgun! TX: ${result.txHash.slice(0, 10)}...`);
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
          <h4 className="font-medium text-gray-900 mb-3">Balances</h4>
          {balances ? (
            <div className="space-y-3">
              {/* EOA Balances */}
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide">EOA (Public)</h5>
                <ul className="space-y-1 text-sm">
                  <li className="flex justify-between">
                    <span className="text-gray-600">ETH:</span>
                    <span className="font-mono font-medium">{balances.eoa?.eth ?? 0} ETH</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-gray-600">WETH:</span>
                    <span className="font-mono font-medium">{balances.eoa?.weth ?? 0} WETH</span>
                  </li>
                </ul>
              </div>
              
              {/* Railgun Balances */}
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide">Railgun (Private)</h5>
                <ul className="space-y-1 text-sm">
                  <li className="flex justify-between">
                    <span className="text-gray-600">WETH:</span>
                    <span className="font-mono font-medium text-purple-600">
                      {fmt18(balances.railgun?.weth)} WETH (Spendable)
                    </span>
                  </li>
                  {balances.railgun?.pendingWeth && fmt18(balances.railgun?.pendingWeth) !== '0' && (
                    <li className="flex justify-between">
                      <span className="text-gray-600">WETH (Pending):</span>
                      <span className="font-mono font-medium text-orange-600">
                        {fmt18(balances.railgun?.pendingWeth)} WETH
                    </span>
                  </li>
                  )}
                  <li className="flex justify-between">
                    <span className="text-gray-600">ETH:</span>
                    <span className="font-mono font-medium text-purple-600">
                      {balances.railgun?.eth ?? 0} ETH
                    </span>
                  </li>
                </ul>
                {balances.railgunError && (
                  <p className="text-xs text-red-500">⚠️ {balances.railgunError}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Loading balances...</p>
          )}
          {busy && <p className="text-blue-600 text-sm mt-2">🔄 Refreshing...</p>}
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
              {busy ? 'Wrapping...' : '🔄 Wrap ETH to WETH'}
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
                {estimating ? 'Estimating...' : '🔍 Estimate Gas'}
              </Button>
              <Button 
                onClick={onShield} 
                disabled={shielding || !shieldAmt || parseFloat(shieldAmt) <= 0}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400"
              >
                {shielding ? 'Shielding...' : '🛡️ Shield WETH'}
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
              🔄 Refresh Balances
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

