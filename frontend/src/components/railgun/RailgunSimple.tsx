/**
 * Simple Railgun Test Component
 * 
 * This is a minimal component demonstrating the new modular Railgun implementation.
 * Use this as a reference when migrating existing components.
 */

import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import {
  initRailgunEngine,
  connectRailgunWallet,
  getPrivateBalances,
  shieldWETH,
  privateTransfer,
  getCurrentWallet
} from '../../lib/railgun';

const RailgunSimple = ({ currentUser }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [railgunAddress, setRailgunAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [shieldAmount, setShieldAmount] = useState('0.01');
  const [transferAmount, setTransferAmount] = useState('0.005');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [loading, setLoading] = useState(false);

  // Initialize engine on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        await initRailgunEngine();
        setIsInitialized(true);
        console.log('✅ Engine initialized');
      } catch (error) {
        console.error('❌ Failed to initialize engine:', error);
        toast.error('Failed to initialize Railgun engine');
      }
    };

    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized]);

  // Check for existing connection
  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    if (stored?.walletID && stored?.railgunAddress) {
      setIsConnected(true);
      setRailgunAddress(stored.railgunAddress);
    }
  }, []);

  // Connect wallet
  const handleConnect = async () => {
    if (!currentUser) {
      toast.error('Please connect MetaMask first');
      return;
    }

    try {
      setLoading(true);
      
      // Get credentials from backend (or generate)
      const backendURL = process.env.REACT_APP_RAILGUN_API_URL || 'http://localhost:3001';
      const response = await fetch(`${backendURL}/api/railgun/wallet-credentials/${currentUser}`);
      
      if (!response.ok) {
        throw new Error('Failed to get wallet credentials');
      }

      const result = await response.json();
      if (!result.success || !result.data) {
        throw new Error('Invalid credentials response');
      }

      const { mnemonic, encryptionKey } = result.data;

      // Connect Railgun wallet
      const { walletID, railgunAddress } = await connectRailgunWallet({
        mnemonic,
        encryptionKeyHex: encryptionKey
      });

      setIsConnected(true);
      setRailgunAddress(railgunAddress);
      toast.success('✅ Railgun wallet connected!');

      // Refresh balance
      await refreshBalance();

    } catch (error) {
      console.error('❌ Failed to connect:', error);
      toast.error('Failed to connect wallet: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Refresh balance
  const refreshBalance = async () => {
    try {
      const balances = await getPrivateBalances();
      setBalance(ethers.formatEther(balances.spendable || '0'));
    } catch (error) {
      console.error('❌ Failed to get balance:', error);
    }
  };

  // Shield WETH
  const handleShield = async () => {
    if (!window.ethereum) {
      toast.error('MetaMask not found');
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const txHash = await shieldWETH(shieldAmount, signer);
      toast.success(`✅ Shielded! TX: ${txHash.slice(0, 10)}...`);

      // Wait a bit then refresh balance
      setTimeout(() => refreshBalance(), 5000);

    } catch (error) {
      console.error('❌ Shield failed:', error);
      toast.error('Shield failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Private transfer
  const handleTransfer = async () => {
    if (!recipientAddress) {
      toast.error('Please enter recipient address');
      return;
    }

    if (!window.ethereum) {
      toast.error('MetaMask not found');
      return;
    }

    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const amountWei = ethers.parseEther(transferAmount);
      const txHash = await privateTransfer(recipientAddress, amountWei, signer);
      toast.success(`✅ Transfer complete! TX: ${txHash.slice(0, 10)}...`);

      // Wait a bit then refresh balance
      setTimeout(() => refreshBalance(), 5000);

    } catch (error) {
      console.error('❌ Transfer failed:', error);
      toast.error('Transfer failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) {
    return <div className="p-4 text-gray-500">Please connect MetaMask first</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Railgun Simple Test</h2>

      {/* Engine Status */}
      <div className="p-4 bg-gray-50 rounded">
        <div className="flex items-center gap-2">
          <span className={isInitialized ? 'text-green-600' : 'text-gray-400'}>
            {isInitialized ? '✅' : '⏳'}
          </span>
          <span>Engine: {isInitialized ? 'Initialized' : 'Not initialized'}</span>
        </div>
      </div>

      {/* Connection */}
      {!isConnected ? (
        <Button onClick={handleConnect} disabled={loading || !isInitialized}>
          {loading ? 'Connecting...' : '🔐 Connect Railgun Wallet'}
        </Button>
      ) : (
        <div className="space-y-4">
          {/* Wallet Info */}
          <div className="p-4 bg-blue-50 rounded">
            <p className="text-sm text-gray-600">Railgun Address:</p>
            <p className="font-mono text-sm">{railgunAddress}</p>
          </div>

          {/* Balance */}
          <div className="p-4 bg-gray-50 rounded">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">Private Balance:</span>
              <Button onClick={refreshBalance} variant="outline" size="sm">
                🔄 Refresh
              </Button>
            </div>
            <p className="text-2xl font-bold">{balance} WETH</p>
          </div>

          {/* Shield Section */}
          <div className="p-4 border rounded space-y-2">
            <h3 className="font-medium">🛡️ Shield WETH</h3>
            <input
              type="number"
              value={shieldAmount}
              onChange={(e) => setShieldAmount(e.target.value)}
              placeholder="Amount in WETH"
              className="w-full px-3 py-2 border rounded"
            />
            <Button onClick={handleShield} disabled={loading}>
              {loading ? 'Shielding...' : '🛡️ Shield WETH'}
            </Button>
          </div>

          {/* Transfer Section */}
          <div className="p-4 border rounded space-y-2">
            <h3 className="font-medium">🔐 Private Transfer</h3>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Recipient Railgun address (0zk1q...)"
              className="w-full px-3 py-2 border rounded font-mono text-sm"
            />
            <input
              type="number"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="Amount in WETH"
              className="w-full px-3 py-2 border rounded"
            />
            <Button onClick={handleTransfer} disabled={loading || !recipientAddress}>
              {loading ? 'Transferring...' : '🔐 Transfer Privately'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RailgunSimple;

