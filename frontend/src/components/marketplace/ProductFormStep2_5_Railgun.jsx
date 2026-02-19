import React, { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import toast from "react-hot-toast";
import { connectRailgun, isRailgunConnectedForEOA } from "../../lib/railgun-clean";

const ProductFormStep2_5_Railgun = ({ onNext, productData, currentUser, backendUrl }) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [railgunAddress, setRailgunAddress] = useState(null);
  const [walletID, setWalletID] = useState(null);

  useEffect(() => {
    const checkExistingConnection = async () => {
      try {
        const isConnectedForUser = await isRailgunConnectedForEOA(currentUser);
        if (isConnectedForUser) {
          const stored = JSON.parse(localStorage.getItem("railgun.wallet") || "null");
          const resolvedAddress = stored?.railgunAddress || null;
          const resolvedWalletID = stored?.walletID || null;
          setIsConnected(true);
          setRailgunAddress(resolvedAddress);
          setWalletID(resolvedWalletID);
        } else {
          setIsConnected(false);
          setRailgunAddress(null);
          setWalletID(null);
        }
      } catch {
        setIsConnected(false);
        setRailgunAddress(null);
        setWalletID(null);
      }
    };

    if (currentUser) {
      checkExistingConnection();
    }
  }, [currentUser, backendUrl]);

  useEffect(() => {
    const handleConnectionChange = () => {
      const checkConnection = async () => {
        try {
          const isConnectedForUser = await isRailgunConnectedForEOA(currentUser);
          if (isConnectedForUser) {
            const stored = JSON.parse(localStorage.getItem("railgun.wallet") || "null");
            const resolvedAddress = stored?.railgunAddress || null;
            const resolvedWalletID = stored?.walletID || null;
            setIsConnected(true);
            setRailgunAddress(resolvedAddress);
            setWalletID(resolvedWalletID);
          } else {
            setIsConnected(false);
            setRailgunAddress(null);
            setWalletID(null);
          }
        } catch {
          setIsConnected(false);
          setRailgunAddress(null);
          setWalletID(null);
        }
      };

      checkConnection();
    };

    window.addEventListener("railgunConnectionChanged", handleConnectionChange);
    return () => {
      window.removeEventListener("railgunConnectionChanged", handleConnectionChange);
    };
  }, [currentUser, backendUrl]);

  const handleConnectRailgun = useCallback(async () => {
    if (!currentUser) {
      toast.error("Please connect your MetaMask wallet first");
      return;
    }

    setIsConnecting(true);
    try {
      const result = await connectRailgun({
        backendBaseURL: backendUrl || "http://localhost:3001",
        userAddress: currentUser,
      });

      if (result.success) {
        setIsConnected(true);
        setRailgunAddress(result.railgunAddress);
        setWalletID(result.walletID);
        toast.success("Railgun wallet connected successfully");
      } else {
        throw new Error(result.error || "Failed to connect Railgun wallet");
      }
    } catch (error) {
      toast.error(`Failed to connect Railgun wallet: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  }, [currentUser, backendUrl]);

  const handleNext = () => {
    if (!isConnected || !railgunAddress) {
      toast.error("Railgun connection is required for private-only payments");
      return;
    }

    onNext({
      sellerRailgunAddress: railgunAddress,
      sellerWalletID: walletID,
      sellerEOA: currentUser,
    });
  };

  return (
    <div className="form-step max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Enable Private Payments</h3>
        <p className="text-gray-600">
          Connect your Railgun wallet. This is required for product creation in private-only mode.
        </p>
      </div>

      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 mb-2">Seller Information</h4>
          <div className="text-sm text-blue-800">
            <div><strong>EOA Address:</strong> {currentUser}</div>
            <div><strong>Product:</strong> {productData?.productName}</div>
            <div><strong>Price:</strong> {productData?.price} ETH</div>
          </div>
        </div>

        {isConnected ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-900">Railgun Wallet Connected</h4>
            <div className="text-sm text-green-800 mt-2">
              <div><strong>Railgun Address:</strong> {railgunAddress}</div>
              <div><strong>Wallet ID:</strong> {walletID?.slice(0, 16)}...</div>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900">Railgun Wallet Not Connected</h4>
            <p className="text-sm text-gray-700 mt-2">
              Connect Railgun to continue. Public-only listing is disabled in this model.
            </p>
          </div>
        )}

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h4 className="font-semibold text-purple-900 mb-2">Private Payment Benefits</h4>
          <ul className="text-sm text-purple-800 space-y-1">
            <li>- Buyers can purchase without revealing transaction amounts</li>
            <li>- Enhanced privacy for sensitive battery transactions</li>
            <li>- Competitive advantage over public-chain amount disclosure</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {!isConnected ? (
            <Button
              onClick={handleConnectRailgun}
              disabled={isConnecting}
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isConnecting ? "Connecting..." : "Connect Railgun Wallet"}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              Continue
            </Button>
          )}
        </div>

        <div className="text-xs text-gray-500 text-center">
          <p>
            This step is mandatory for new products in private-only mode.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProductFormStep2_5_Railgun;
