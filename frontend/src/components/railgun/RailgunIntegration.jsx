import React, { useState } from 'react';
import { 
  Box, 
  Tabs, 
  Tab, 
  Typography, 
  Alert,
  Container,
  Paper
} from '@mui/material';
import { Shield, Wallet, Eye } from 'lucide-react';
import RailgunWalletConnect from './RailgunWalletConnect';
import RailgunPaymentFlow from './RailgunPaymentFlow';
import RailgunAuditVerification from './RailgunAuditVerification';

const RailgunIntegration = ({ escrowContract }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [walletManager, setWalletManager] = useState(null);
  const [walletInfo, setWalletInfo] = useState(null);
  const [error, setError] = useState(null);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleWalletConnected = (manager, info) => {
    setWalletManager(manager);
    setWalletInfo(info);
    setError(null);
  };

  const handleError = (errorMsg) => {
    setError(errorMsg);
  };

  const handlePaymentComplete = (result) => {
    console.log('Payment completed:', result);
    // You can add additional logic here, such as updating UI state
  };

  // Mock product data for demonstration
  const mockProduct = {
    id: 1,
    name: "Tesla Model S Battery Pack",
    price: 1000000000, // 1000 USDC in smallest units
    deliveryFee: 50000000, // 50 USDC in smallest units
    sellerAddress: "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    transporterAddress: "0x1234567890123456789012345678901234567890",
    tokenAddress: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F" // USDC on Goerli
  };

  const mockVcHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  const TabPanel = ({ children, value, index, ...other }) => (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`railgun-tabpanel-${index}`}
      aria-labelledby={`railgun-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ 
          bgcolor: 'primary.main', 
          color: 'white', 
          p: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <Shield size={32} />
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Railgun Privacy Integration
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              Private payments for EV battery marketplace with audit capabilities
            </Typography>
          </Box>
        </Box>

        {/* Wallet Status */}
        {walletInfo && (
          <Box sx={{ p: 2, bgcolor: 'success.50', borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="success.main">
              ✅ Connected: {walletInfo.metaMaskAddress.slice(0, 6)}...{walletInfo.metaMaskAddress.slice(-4)}
            </Typography>
          </Box>
        )}

        {/* Error Display */}
        {error && (
          <Box sx={{ p: 2 }}>
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Box>
        )}

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange}
            aria-label="Railgun integration tabs"
            sx={{ px: 2 }}
          >
            <Tab 
              icon={<Wallet size={20} />} 
              label="Wallet Connection" 
              iconPosition="start"
            />
            <Tab 
              icon={<Shield size={20} />} 
              label="Private Payment" 
              iconPosition="start"
              disabled={!walletManager}
            />
            <Tab 
              icon={<Eye size={20} />} 
              label="Audit Verification" 
              iconPosition="start"
            />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <TabPanel value={activeTab} index={0}>
          <RailgunWalletConnect 
            onWalletConnected={handleWalletConnected}
            onError={handleError}
          />
        </TabPanel>

        <TabPanel value={activeTab} index={1}>
          {walletManager ? (
            <RailgunPaymentFlow
              product={mockProduct}
              vcHash={mockVcHash}
              walletManager={walletManager}
              escrowContract={escrowContract}
              onPaymentComplete={handlePaymentComplete}
              onError={handleError}
            />
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                Wallet Not Connected
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Please connect your wallet in the "Wallet Connection" tab first.
              </Typography>
            </Box>
          )}
        </TabPanel>

        <TabPanel value={activeTab} index={2}>
          <RailgunAuditVerification 
            escrowContract={escrowContract}
          />
        </TabPanel>
      </Paper>

      {/* Information Panel */}
      <Paper elevation={1} sx={{ mt: 3, p: 3, bgcolor: 'info.50' }}>
        <Typography variant="h6" gutterBottom>
          About Railgun Privacy
        </Typography>
        <Typography variant="body2" paragraph>
          Railgun provides privacy for Ethereum transactions by using zero-knowledge proofs. 
          Your payment amounts and recipient details are hidden from public view while maintaining 
          full auditability through memo-based verification.
        </Typography>
        <Typography variant="body2" paragraph>
          <strong>Key Features:</strong>
        </Typography>
        <Box component="ul" sx={{ pl: 2 }}>
          <Typography component="li" variant="body2">
            <strong>Private Transfers:</strong> Transaction amounts are hidden from public blockchain view
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Audit Trail:</strong> Memo-based verification allows authorized auditors to verify transactions
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Regulatory Compliance:</strong> Maintains transparency for compliance while protecting privacy
          </Typography>
          <Typography component="li" variant="body2">
            <strong>Dual Wallet Model:</strong> MetaMask for L1 operations, Railgun for private transactions
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
};

export default RailgunIntegration; 