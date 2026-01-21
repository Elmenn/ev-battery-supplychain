import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import toast from 'react-hot-toast';
import { connectRailgun, disconnectRailgun, restoreRailgunConnection } from '../../lib/railgun-clean';

const RailgunConnectionButton = ({ currentUser }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [railgunAddress, setRailgunAddress] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [railgunWalletID, setRailgunWalletID] = useState(null);

  // Copy address to clipboard
  const copyAddress = async () => {
    if (!railgunAddress) return;
    try {
      await navigator.clipboard.writeText(railgunAddress);
      toast.success('Address copied!');
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnectRailgun();
      setIsConnected(false);
      setRailgunAddress(null);
      setRailgunWalletID(null);
      toast.success('Railgun wallet disconnected');
      console.log('Railgun wallet disconnected');
    } catch (error) {
      console.error('Error disconnecting:', error);
      toast.error('Failed to disconnect');
    }
  }, []);

  const checkConnectionStatus = useCallback(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
      if (stored && stored.walletID && stored.userAddress) {
        // Accept credentials-only stored connections (backend holds secrets)
        const belongsToCurrentUser = stored.userAddress.toLowerCase() === currentUser.toLowerCase();
        const placeholderAddress = stored.railgunAddress || `0zk1q_dummy_${stored.walletID}`;
        // Check if the stored connection belongs to the current user
        if (belongsToCurrentUser) {
          setIsConnected(true);
          setRailgunAddress(placeholderAddress);
          setRailgunWalletID(stored.walletID);
          console.log('Found existing Railgun connection for current user:', stored);
        } else {
          // Different user - clear the connection
          console.log('Found Railgun connection for different user - clearing');
          console.log('   - Stored user:', stored.userAddress);
          console.log('   - Current user:', currentUser);
          // CRITICAL: Only disconnect if we're sure it's a different user
          // Don't disconnect if we're still connecting (race condition)
          const timeSinceConnection = stored.timestamp ? Date.now() - stored.timestamp : Infinity;
          if (timeSinceConnection > 5000) { // Only clear if connection is older than 5 seconds
            handleDisconnect();
          } else {
            console.log('Connection is recent - might be in progress, not clearing yet');
          }
        }
      } else {
        setIsConnected(false);
        setRailgunAddress(null);
        setRailgunWalletID(null);
        console.log('No existing Railgun connection found');
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
      setIsConnected(false);
    }
  }, [currentUser, handleDisconnect]);

  // Check connection status on mount and restore if needed
  useEffect(() => {
    const restoreConnection = async () => {
      const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
      if (stored && stored.userAddress && stored.userAddress.toLowerCase() === currentUser.toLowerCase()) {
        console.log('Restoring Railgun connection...');
        const result = await restoreRailgunConnection(currentUser);
        if (result.success) {
          setIsConnected(true);
          setRailgunAddress(result.railgunAddress);
          setRailgunWalletID(result.walletID);
          console.log('Railgun connection restored');
        }
      } else {
        checkConnectionStatus();
      }
    };

    if (currentUser) {
      restoreConnection();
    }
  }, [currentUser, checkConnectionStatus]);

  // Listen for MetaMask account changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      console.log('MetaMask accounts changed:', accounts);

      if (accounts.length === 0) {
        // User disconnected MetaMask
        console.log('MetaMask disconnected - clearing Railgun connection');
        handleDisconnect();
      } else {
        const newAddress = accounts[0].toLowerCase();
        console.log('MetaMask switched to:', newAddress);

        // Check if the connected Railgun wallet belongs to the new EOA
        if (isConnected) {
          // Get the stored connection info to check the EOA
          try {
            const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
            if (stored && stored.userAddress) {
              const connectedEOA = stored.userAddress.toLowerCase();
              if (connectedEOA !== newAddress) {
                console.log('EOA changed - disconnecting Railgun wallet');
                console.log('   - Previous EOA:', connectedEOA);
                console.log('   - New EOA:', newAddress);
                handleDisconnect();
              } else {
                console.log('Same EOA - keeping Railgun connection');
              }
            }
          } catch (error) {
            console.log('Error checking stored connection:', error);
            // If we can't check, disconnect to be safe
            handleDisconnect();
          }
        }
      }
    };

    // Add event listener
    window.ethereum.on('accountsChanged', handleAccountsChanged);

    // Cleanup
    return () => {
      if (window.ethereum && window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, [isConnected, currentUser, handleDisconnect]);

  const handleConnectRailgun = async () => {
    // Debounce: ignore clicks while connecting
    if (isConnecting) {
      console.log('Connection already in progress, ignoring click');
      return;
    }

    try {
      setIsConnecting(true);
      console.log('Connecting to Railgun for user:', currentUser);

      // Connect with current user's address
      // Use environment variable or reliable default (rpc.sepolia.org)
      const rpcUrl = process.env.REACT_APP_RPC_URL || 'https://rpc.sepolia.org';
      const result = await connectRailgun({
        backendBaseURL: 'http://localhost:3001',
        userAddress: currentUser,
        rpcUrl: rpcUrl
      });

      if (result && result.success) {
        setIsConnected(true);
        setRailgunAddress(result.railgunAddress || null);
        setRailgunWalletID(result.walletID || null);

        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('railgunConnectionChanged'));

        toast.success('Railgun wallet connected successfully!');
        console.log('Railgun connection successful:', result);
      } else {
        throw new Error(result && result.error ? result.error : 'Connection failed - no wallet data returned');
      }

    } catch (error) {
      console.error('Railgun connection failed:', error);
      // User-friendly error message (hide technical details)
      const userMessage = error.message.includes('rejected') || error.message.includes('cancelled')
        ? 'Connection cancelled'
        : 'Failed to connect. Please try again.';
      toast.error(userMessage);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  // Don't render if no user is connected
  if (!currentUser) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {isConnected ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
            <span>Railgun:</span>
            <span className="font-mono">
              {railgunAddress ? `${railgunAddress.slice(0, 8)}...${railgunAddress.slice(-6)}` : 'Connected'}
            </span>
            <button
              onClick={copyAddress}
              className="ml-1 p-0.5 hover:bg-green-100 rounded"
              title="Copy full address"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          <Button
            onClick={handleDisconnect}
            variant="outline"
            size="sm"
            className="text-xs border-red-200 text-red-700 hover:bg-red-50"
          >
            Disconnect
          </Button>
        </div>
      ) : (
        <Button
          onClick={handleConnectRailgun}
          disabled={isConnecting}
          variant="outline"
          className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
        >
          {isConnecting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </span>
          ) : (
            'Connect Railgun'
          )}
        </Button>
      )}
    </div>
  );
};

export default RailgunConnectionButton;
