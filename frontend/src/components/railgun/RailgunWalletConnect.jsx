import React, { useState, useEffect } from 'react';
import { Button, Card, Typography, Box, Alert, CircularProgress } from '@mui/material';
import { Wallet, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { RailgunWalletManager, RAILGUN_CONFIG } from '../../utils/railgunUtils';

const RailgunWalletConnect = ({ onWalletConnected, onError }) => {
  const [walletManager, setWalletManager] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [walletInfo, setWalletInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const manager = new RailgunWalletManager();
    setWalletManager(manager);
  }, []);

  const connectMetaMask = async () => {
    if (!window.ethereum) {
      const errorMsg = 'MetaMask is not installed. Please install MetaMask to use private payments.';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Request account access
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts.length === 0) {
        throw new Error('No accounts found. Please connect MetaMask.');
      }

      // Create ethers provider
      const provider = new (await import('ethers')).BrowserProvider(window.ethereum);
      
      // Initialize Railgun wallet manager
      const walletInfo = await walletManager.initialize(provider);
      
      setWalletInfo(walletInfo);
      setConnectionStatus('connected');
      onWalletConnected?.(walletManager, walletInfo);
      
      console.log('Railgun wallet connected successfully:', walletInfo);
    } catch (error) {
      console.error('Failed to connect Railgun wallet:', error);
      const errorMsg = error.message || 'Failed to connect wallet';
      setError(errorMsg);
      onError?.(errorMsg);
      setConnectionStatus('error');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setWalletInfo(null);
    setConnectionStatus('disconnected');
    setError(null);
  };

  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return <CheckCircle color="green" size={20} />;
      case 'error':
        return <AlertCircle color="red" size={20} />;
      default:
        return <Wallet size={20} />;
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected';
      case 'error':
        return 'Connection Failed';
      default:
        return 'Not Connected';
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'success';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  };

  return (
    <Card sx={{ p: 3, maxWidth: 500, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Shield size={24} style={{ marginRight: 8 }} />
        <Typography variant="h6" component="h2">
          Private Wallet Connection
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Connect your MetaMask wallet to enable private payments using Railgun. 
        Your transaction amounts will be hidden from public view.
      </Typography>

      {/* Connection Status */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        {getStatusIcon()}
        <Typography 
          variant="body1" 
          color={getStatusColor()}
          sx={{ ml: 1, fontWeight: 'medium' }}
        >
          {getStatusText()}
        </Typography>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Wallet Info Display */}
      {walletInfo && (
        <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            MetaMask Address:
          </Typography>
          <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
            {walletInfo.metaMaskAddress}
          </Typography>
          
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            Railgun Address:
          </Typography>
          <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
            {walletInfo.railgunAddress}
          </Typography>
        </Box>
      )}

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2 }}>
        {connectionStatus === 'connected' ? (
          <Button
            variant="outlined"
            color="error"
            onClick={disconnect}
            fullWidth
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={connectMetaMask}
            disabled={isConnecting}
            fullWidth
            startIcon={isConnecting ? <CircularProgress size={16} /> : <Wallet />}
          >
            {isConnecting ? 'Connecting...' : 'Connect MetaMask'}
          </Button>
        )}
      </Box>

      {/* Network Info */}
      <Box sx={{ mt: 3, p: 2, bgcolor: 'info.50', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          <strong>Current Network:</strong> {RAILGUN_CONFIG.NETWORKS.GOERLI.name}
        </Typography>
        <br />
        <Typography variant="caption" color="text.secondary">
          <strong>Supported Token:</strong> USDC
        </Typography>
      </Box>
    </Card>
  );
};

export default RailgunWalletConnect; 