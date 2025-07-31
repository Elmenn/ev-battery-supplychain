import React, { useState } from 'react';
import { 
  Card, 
  Typography, 
  Box, 
  Button, 
  Stepper, 
  Step, 
  StepLabel, 
  StepContent,
  Alert,
  CircularProgress,
  Divider,
  Chip
} from '@mui/material';
import { 
  Shield, 
  Send, 
  CheckCircle, 
  AlertCircle, 
  DollarSign,
  Lock,
  EyeOff
} from 'lucide-react';
import { RailgunPaymentFlow as PaymentFlow, RAILGUN_CONFIG } from '../../utils/railgunUtils';

const steps = [
  {
    label: 'Shield Funds',
    description: 'Transfer USDC to private pool',
    icon: <Shield size={20} />
  },
  {
    label: 'Private Transfer',
    description: 'Send payment with hidden amounts',
    icon: <Send size={20} />
  },
  {
    label: 'Record Payment',
    description: 'Link payment to escrow contract',
    icon: <CheckCircle size={20} />
  }
];

const RailgunPaymentFlow = ({ 
  product, 
  vcHash, 
  walletManager, 
  escrowContract, 
  onPaymentComplete, 
  onError 
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [error, setError] = useState(null);
  const [stepStatus, setStepStatus] = useState({});

  const paymentFlow = new PaymentFlow(walletManager, escrowContract);

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const executePayment = async () => {
    if (!walletManager || !escrowContract) {
      const errorMsg = 'Wallet or contract not initialized';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStepStatus({});

    try {
      // Step 1: Shield funds
      setStepStatus({ 0: 'processing' });
      console.log('Shielding funds...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate shielding
      setStepStatus({ 0: 'completed' });

      // Step 2: Private transfer
      setStepStatus({ 0: 'completed', 1: 'processing' });
      console.log('Creating private transfer...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate transfer
      setStepStatus({ 0: 'completed', 1: 'completed' });

      // Step 3: Record payment
      setStepStatus({ 0: 'completed', 1: 'completed', 2: 'processing' });
      console.log('Recording payment on contract...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate recording
      setStepStatus({ 0: 'completed', 1: 'completed', 2: 'completed' });

      // Execute the actual payment
      const result = await paymentFlow.executePrivatePayment(product, vcHash);
      
      setPaymentResult(result);
      onPaymentComplete?.(result);
      
      console.log('Payment completed successfully:', result);
    } catch (error) {
      console.error('Payment failed:', error);
      const errorMsg = error.message || 'Payment failed';
      setError(errorMsg);
      onError?.(errorMsg);
      setStepStatus({ [activeStep]: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const getStepIcon = (stepIndex) => {
    const status = stepStatus[stepIndex];
    
    if (status === 'processing') {
      return <CircularProgress size={20} />;
    } else if (status === 'completed') {
      return <CheckCircle color="green" size={20} />;
    } else if (status === 'error') {
      return <AlertCircle color="red" size={20} />;
    } else {
      return steps[stepIndex].icon;
    }
  };

  const getStepColor = (stepIndex) => {
    const status = stepStatus[stepIndex];
    
    if (status === 'completed') {
      return 'success';
    } else if (status === 'error') {
      return 'error';
    } else if (status === 'processing') {
      return 'primary';
    } else {
      return 'default';
    }
  };

  const formatAmount = (amount) => {
    return `${amount / 1e6} USDC`; // Assuming 6 decimals for USDC
  };

  return (
    <Card sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Lock size={24} style={{ marginRight: 8 }} />
        <Typography variant="h6" component="h2">
          Private Payment Flow
        </Typography>
        <Chip 
          label="Privacy Enabled" 
          color="success" 
          size="small" 
          sx={{ ml: 2 }}
          icon={<EyeOff size={14} />}
        />
      </Box>

      {/* Product Summary */}
      <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Payment Summary
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2">Product:</Typography>
          <Typography variant="body2" fontWeight="medium">{product.name}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2">Product Price:</Typography>
          <Typography variant="body2" fontWeight="medium">{formatAmount(product.price)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2">Delivery Fee:</Typography>
          <Typography variant="body2" fontWeight="medium">{formatAmount(product.deliveryFee)}</Typography>
        </Box>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" fontWeight="medium">Total:</Typography>
          <Typography variant="body2" fontWeight="bold">
            {formatAmount(product.price + product.deliveryFee)}
          </Typography>
        </Box>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Payment Steps */}
      <Stepper activeStep={activeStep} orientation="vertical">
        {steps.map((step, index) => (
          <Step key={step.label}>
            <StepLabel
              StepIconComponent={() => getStepIcon(index)}
              color={getStepColor(index)}
            >
              <Typography variant="subtitle1" fontWeight="medium">
                {step.label}
              </Typography>
            </StepLabel>
            <StepContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {step.description}
              </Typography>
              
              {stepStatus[index] === 'processing' && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                  <Typography variant="body2" color="primary">
                    Processing...
                  </Typography>
                </Box>
              )}
              
              {stepStatus[index] === 'completed' && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <CheckCircle color="green" size={16} style={{ marginRight: 8 }} />
                  <Typography variant="body2" color="success.main">
                    Completed
                  </Typography>
                </Box>
              )}
              
              {stepStatus[index] === 'error' && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AlertCircle color="red" size={16} style={{ marginRight: 8 }} />
                  <Typography variant="body2" color="error.main">
                    Failed
                  </Typography>
                </Box>
              )}
            </StepContent>
          </Step>
        ))}
      </Stepper>

      {/* Action Buttons */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
        <Button
          variant="outlined"
          onClick={handleBack}
          disabled={activeStep === 0 || isProcessing}
        >
          Back
        </Button>
        
        <Button
          variant="contained"
          onClick={activeStep === steps.length - 1 ? executePayment : handleNext}
          disabled={isProcessing}
          startIcon={isProcessing ? <CircularProgress size={16} /> : <DollarSign />}
          sx={{ flex: 1 }}
        >
          {isProcessing ? 'Processing...' : 
           activeStep === steps.length - 1 ? 'Execute Private Payment' : 'Next'}
        </Button>
      </Box>

      {/* Payment Result */}
      {paymentResult && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'success.50', borderRadius: 1 }}>
          <Typography variant="subtitle2" color="success.main" gutterBottom>
            Payment Completed Successfully!
          </Typography>
          <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
            Transaction Hash: {paymentResult.txHash}
          </Typography>
          <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
            Memo Hash: {paymentResult.memo}
          </Typography>
        </Box>
      )}

      {/* Privacy Notice */}
      <Box sx={{ mt: 3, p: 2, bgcolor: 'info.50', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          <strong>Privacy Notice:</strong> Your payment amount and recipient details are hidden from public view. 
          Only you and authorized auditors can verify the transaction details using the memo hash.
        </Typography>
      </Box>
    </Card>
  );
};

export default RailgunPaymentFlow; 