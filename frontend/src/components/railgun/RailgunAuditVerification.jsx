import React, { useState } from 'react';
import { 
  Card, 
  Typography, 
  Box, 
  Button, 
  TextField, 
  Alert, 
  CircularProgress,
  Divider,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import { 
  Search, 
  CheckCircle, 
  AlertCircle, 
  Shield,
  Eye,
  FileText
} from 'lucide-react';
import { ExpandMore } from '@mui/icons-material';
import { createMemo, createBlindMemo } from '../../utils/railgunUtils';

const RailgunAuditVerification = ({ escrowContract }) => {
  const [verificationData, setVerificationData] = useState({
    productId: '',
    vcHash: '',
    amount: '',
    nonce: '',
    memoHash: ''
  });
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [paymentRecord, setPaymentRecord] = useState(null);

  const handleInputChange = (field, value) => {
    setVerificationData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const verifyMemo = async () => {
    if (!verificationData.productId || !verificationData.vcHash || !verificationData.memoHash) {
      setError('Please fill in all required fields');
      return;
    }

    setIsVerifying(true);
    setError(null);
    setVerificationResult(null);

    try {
      const { productId, vcHash, amount, nonce, memoHash } = verificationData;
      
      // Convert inputs to proper types
      const productIdNum = parseInt(productId);
      const amountNum = amount ? parseInt(amount) : 0;
      const nonceNum = nonce ? parseInt(nonce) : Date.now();

      // Create computed memo
      const computedMemo = amount 
        ? createMemo(productIdNum, vcHash, amountNum, nonceNum)
        : createBlindMemo(productIdNum, vcHash, nonceNum);

      const isValid = computedMemo === memoHash;

      setVerificationResult({
        verified: isValid,
        computedMemo: computedMemo,
        providedMemo: memoHash,
        amount: amountNum,
        productId: productIdNum,
        vcHash: vcHash,
        nonce: nonceNum,
        amountDisclosed: !!amount
      });

      console.log('Memo verification result:', {
        verified: isValid,
        computedMemo: computedMemo,
        providedMemo: memoHash
      });
    } catch (error) {
      console.error('Memo verification failed:', error);
      setError(error.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const fetchPaymentRecord = async () => {
    if (!verificationData.productId || !escrowContract) {
      setError('Product ID and escrow contract are required');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const productId = parseInt(verificationData.productId);
      
      // Get payment details from contract
      const [memoHash, railgunTxRef, recorder] = await escrowContract.getPrivatePaymentDetails();
      const hasPayment = await escrowContract.hasPrivatePayment();

      if (hasPayment) {
        setPaymentRecord({
          productId: productId,
          memoHash: memoHash,
          railgunTxRef: railgunTxRef,
          recorder: recorder,
          hasPayment: hasPayment
        });
      } else {
        setPaymentRecord({
          productId: productId,
          hasPayment: false
        });
      }
    } catch (error) {
      console.error('Failed to fetch payment record:', error);
      setError(error.message || 'Failed to fetch payment record');
    } finally {
      setIsVerifying(false);
    }
  };

  const clearResults = () => {
    setVerificationResult(null);
    setPaymentRecord(null);
    setError(null);
  };

  const getVerificationIcon = () => {
    if (isVerifying) {
      return <CircularProgress size={20} />;
    } else if (verificationResult?.verified) {
      return <CheckCircle color="green" size={20} />;
    } else if (verificationResult && !verificationResult.verified) {
      return <AlertCircle color="red" size={20} />;
    } else {
      return <Search size={20} />;
    }
  };

  const getVerificationColor = () => {
    if (verificationResult?.verified) {
      return 'success';
    } else if (verificationResult && !verificationResult.verified) {
      return 'error';
    } else {
      return 'primary';
    }
  };

  return (
    <Card sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Shield size={24} style={{ marginRight: 8 }} />
        <Typography variant="h6" component="h2">
          Audit Verification
        </Typography>
        <Chip 
          label="Memo Verification" 
          color="info" 
          size="small" 
          sx={{ ml: 2 }}
          icon={<Eye size={14} />}
        />
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Verify private payment memos and check payment records on the escrow contract. 
        This tool helps auditors validate transaction integrity.
      </Typography>

      {/* Input Form */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Verification Parameters
        </Typography>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <TextField
            label="Product ID"
            value={verificationData.productId}
            onChange={(e) => handleInputChange('productId', e.target.value)}
            placeholder="e.g., 12345"
            size="small"
          />
          <TextField
            label="VC Hash"
            value={verificationData.vcHash}
            onChange={(e) => handleInputChange('vcHash', e.target.value)}
            placeholder="0x..."
            size="small"
          />
        </Box>
        
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <TextField
            label="Amount (optional for blind memo)"
            value={verificationData.amount}
            onChange={(e) => handleInputChange('amount', e.target.value)}
            placeholder="e.g., 1000000 (in smallest units)"
            size="small"
          />
          <TextField
            label="Nonce (optional)"
            value={verificationData.nonce}
            onChange={(e) => handleInputChange('nonce', e.target.value)}
            placeholder="e.g., 1234567890"
            size="small"
          />
        </Box>
        
        <TextField
          label="Memo Hash"
          value={verificationData.memoHash}
          onChange={(e) => handleInputChange('memoHash', e.target.value)}
          placeholder="0x..."
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={verifyMemo}
            disabled={isVerifying}
            startIcon={getVerificationIcon()}
            color={getVerificationColor()}
          >
            {isVerifying ? 'Verifying...' : 'Verify Memo'}
          </Button>
          
          <Button
            variant="outlined"
            onClick={fetchPaymentRecord}
            disabled={isVerifying || !escrowContract}
            startIcon={<FileText size={16} />}
          >
            Fetch Payment Record
          </Button>
          
          <Button
            variant="text"
            onClick={clearResults}
            disabled={isVerifying}
          >
            Clear
          </Button>
        </Box>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Verification Result */}
      {verificationResult && (
        <Accordion defaultExpanded sx={{ mb: 3 }}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              {verificationResult.verified ? (
                <CheckCircle color="green" size={20} style={{ marginRight: 8 }} />
              ) : (
                <AlertCircle color="red" size={20} style={{ marginRight: 8 }} />
              )}
              <Typography variant="subtitle1">
                Memo Verification Result
              </Typography>
              <Chip 
                label={verificationResult.verified ? 'VERIFIED' : 'FAILED'} 
                color={verificationResult.verified ? 'success' : 'error'} 
                size="small" 
                sx={{ ml: 2 }}
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">Product ID:</Typography>
                <Typography variant="body2">{verificationResult.productId}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">VC Hash:</Typography>
                <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                  {verificationResult.vcHash}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Amount:</Typography>
                <Typography variant="body2">
                  {verificationResult.amountDisclosed ? `${verificationResult.amount}` : 'Hidden (Blind Memo)'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Nonce:</Typography>
                <Typography variant="body2">{verificationResult.nonce}</Typography>
              </Box>
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Box>
              <Typography variant="caption" color="text.secondary">Computed Memo:</Typography>
              <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                {verificationResult.computedMemo}
              </Typography>
            </Box>
            
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">Provided Memo:</Typography>
              <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                {verificationResult.providedMemo}
              </Typography>
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Payment Record */}
      {paymentRecord && (
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FileText size={20} style={{ marginRight: 8 }} />
              <Typography variant="subtitle1">
                Payment Record
              </Typography>
              <Chip 
                label={paymentRecord.hasPayment ? 'FOUND' : 'NOT FOUND'} 
                color={paymentRecord.hasPayment ? 'success' : 'warning'} 
                size="small" 
                sx={{ ml: 2 }}
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {paymentRecord.hasPayment ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Product ID:</Typography>
                  <Typography variant="body2">{paymentRecord.productId}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Recorder:</Typography>
                  <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                    {paymentRecord.recorder}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Memo Hash:</Typography>
                  <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                    {paymentRecord.memoHash}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Railgun TX Ref:</Typography>
                  <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                    {paymentRecord.railgunTxRef}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No private payment record found for product ID {paymentRecord.productId}
              </Typography>
            )}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Instructions */}
      <Box sx={{ mt: 3, p: 2, bgcolor: 'info.50', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          <strong>Instructions:</strong> Enter the memo parameters to verify a private payment. 
          For blind memos, leave the amount field empty. The verification will compute the memo hash 
          and compare it with the provided hash to ensure transaction integrity.
        </Typography>
      </Box>
    </Card>
  );
};

export default RailgunAuditVerification; 