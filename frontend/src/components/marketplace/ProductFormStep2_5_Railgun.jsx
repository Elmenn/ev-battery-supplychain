import React, { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import toast from "react-hot-toast";
import { connectRailgun, isRailgunConnectedForEOA } from "../../lib/railgun-clean";

const ProductFormStep2_5_Railgun = ({ onNext, productData, currentUser, backendUrl }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [railgunAddress, setRailgunAddress] = useState(null);
  const [walletID, setWalletID] = useState(null);

  // Check if Railgun is already connected for this user
  useEffect(() => {
    const checkExistingConnection = async () => {
      try {
        const connectionInfo = await isRailgunConnectedForEOA(currentUser);
        if (connectionInfo.isConnected) {
          setIsConnected(true);
          setRailgunAddress(connectionInfo.railgunAddress);
          setWalletID(connectionInfo.walletID);
          console.log('✅ Found existing Railgun connection for seller:', connectionInfo);
        } else {
          console.log('🔍 No existing Railgun connection found for seller');
        }
      } catch (error) {
        console.log('🔍 No existing Railgun connection found for seller');
      }
    };

    if (currentUser) {
      checkExistingConnection();
    }
  }, [currentUser]);

  // Listen for Railgun connection changes
  useEffect(() => {
    const handleConnectionChange = () => {
      console.log('🔄 Railgun connection changed - checking for seller...');
      const checkConnection = async () => {
        try {
          const connectionInfo = await isRailgunConnectedForEOA(currentUser);
          if (connectionInfo.isConnected) {
            setIsConnected(true);
            setRailgunAddress(connectionInfo.railgunAddress);
            setWalletID(connectionInfo.walletID);
            console.log('✅ Railgun connection detected for seller:', connectionInfo);
          } else {
            setIsConnected(false);
            setRailgunAddress(null);
            setWalletID(null);
            console.log('🔍 No Railgun connection for seller');
          }
        } catch (error) {
          console.log('🔍 Error checking connection:', error);
        }
      };
      checkConnection();
    };

    // Listen for custom events
    window.addEventListener('railgunConnectionChanged', handleConnectionChange);
    
    return () => {
      window.removeEventListener('railgunConnectionChanged', handleConnectionChange);
    };
  }, [currentUser]);

  const handleConnectRailgun = useCallback(async () => {
    if (!currentUser) {
      toast.error('Please connect your MetaMask wallet first');
      return;
    }

    setIsConnecting(true);
    try {
      console.log('🔐 Connecting seller to Railgun for product creation...');
      
      const result = await connectRailgun({ 
        backendBaseURL: backendUrl || 'http://localhost:3001',
        userAddress: currentUser 
      });
      
      if (result.success) {
        setIsConnected(true);
        setRailgunAddress(result.railgunAddress);
        setWalletID(result.walletID);
        
        toast.success('✅ Railgun wallet connected successfully!');
        console.log('✅ Seller Railgun connection successful:', {
          walletID: result.walletID,
          railgunAddress: result.railgunAddress,
          userAddress: currentUser
        });
      } else {
        throw new Error(result.error || 'Failed to connect Railgun wallet');
      }
    } catch (error) {
      console.error('❌ Failed to connect Railgun wallet:', error);
      toast.error(`Failed to connect Railgun wallet: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  }, [currentUser]);

  const handleNext = () => {
    console.log('🔍 handleNext called - checking connection state:', {
      isConnected,
      railgunAddress,
      walletID,
      currentUser
    });
    
    if (!isConnected || !railgunAddress) {
      console.log('❌ Connection check failed:', { isConnected, railgunAddress });
      toast.error('Please connect your Railgun wallet to enable private payments');
      return;
    }

    console.log('✅ Connection check passed - proceeding to next step');
    
    // Pass the Railgun connection info to the next step
    const nextData = {
      sellerRailgunAddress: railgunAddress,
      sellerWalletID: walletID,
      sellerEOA: currentUser
    };
    
    console.log('📤 Passing data to next step:', nextData);
    onNext(nextData);
  };

  const handleSkip = () => {
    // Allow skipping but warn about limitations
    const confirmed = window.confirm(
      '⚠️ Skipping Railgun connection will disable private payments for this product.\n\n' +
      'Buyers will only be able to purchase publicly (visible transactions).\n\n' +
      'Are you sure you want to continue without private payment support?'
    );
    
    if (confirmed) {
      onNext({
        sellerRailgunAddress: null,
        sellerWalletID: null,
        sellerEOA: currentUser,
        privatePaymentsDisabled: true
      });
    }
  };

  return (
    <div className="form-step max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          🔐 Enable Private Payments
        </h3>
        <p className="text-gray-600">
          Connect your Railgun wallet to enable private payments for this product
        </p>
      </div>

      <div className="space-y-6">
        {/* Current User Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Seller Information</h4>
          <div className="text-sm text-blue-800">
            <div><strong>EOA Address:</strong> {currentUser}</div>
            <div><strong>Product:</strong> {productData?.productName}</div>
            <div><strong>Price:</strong> {productData?.price} ETH</div>
          </div>
        </div>

        {/* Connection Status */}
        {isConnected ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              <h4 className="font-semibold text-green-900">Railgun Wallet Connected</h4>
            </div>
            <div className="text-sm text-green-800">
              <div><strong>Railgun Address:</strong> {railgunAddress}</div>
              <div><strong>Wallet ID:</strong> {walletID?.slice(0, 16)}...</div>
            </div>
            <p className="text-xs text-green-700 mt-2">
              ✅ Private payments are now enabled for this product
            </p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <div className="w-3 h-3 bg-gray-400 rounded-full mr-2"></div>
              <h4 className="font-semibold text-gray-900">Railgun Wallet Not Connected</h4>
            </div>
            <p className="text-sm text-gray-700">
              Connect your Railgun wallet to enable private payments for buyers
            </p>
          </div>
        )}

        {/* Benefits */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="font-semibold text-purple-900 mb-2">🔒 Private Payment Benefits</h4>
          <ul className="text-sm text-purple-800 space-y-1">
            <li>• Buyers can purchase without revealing transaction amounts</li>
            <li>• Enhanced privacy for sensitive battery transactions</li>
            <li>• Competitive advantage over public-only listings</li>
            <li>• Optional: You can still accept public payments</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          {!isConnected ? (
            <Button
              onClick={handleConnectRailgun}
              disabled={isConnecting}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isConnecting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Connecting...
                </>
              ) : (
                <>
                  🔐 Connect Railgun Wallet
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              ✅ Continue with Private Payments
            </Button>
          )}
          
          <Button
            onClick={handleSkip}
            variant="outline"
            className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            ⚠️ Skip (Public Only)
          </Button>
        </div>

        {/* Help Text */}
        <div className="text-xs text-gray-500 text-center">
          <p>
            <strong>Note:</strong> You can always reconnect your Railgun wallet later to enable private payments.
            <br />
            This step only affects new products - existing products remain unchanged.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProductFormStep2_5_Railgun;
