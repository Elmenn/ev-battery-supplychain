// Shield functions for Railgun (Sepolia)
// Complete rewrite based on Railgun patterns

import { ethers } from 'ethers';
import {
  NetworkName,
  NETWORK_CONFIG,
  getEVMGasTypeForTransaction,
  EVMGasType,
  TXIDVersion,
} from '@railgun-community/shared-models';
import {
  gasEstimateForShield,
  populateShield,
  getShieldPrivateKeySignatureMessage,
} from '@railgun-community/wallet';
import { initializeSDK } from '../railgun-client-browser';
import { refreshBalances as localRefreshBalances } from '../railgun/wallets/balances.js';
import {
  awaitWalletScan as localAwaitWalletScan,
  walletForID as localWalletForID,
} from '../railgun/wallets/wallets.js';

// -------------------------
// Helper functions
// -------------------------

async function getShieldPrivateKey(signer, fromWalletAddress) {
  const baseMsg = getShieldPrivateKeySignatureMessage();
  const contextualMsg = `${baseMsg}\nChain: ${NetworkName.EthereumSepolia}\nEOA: ${fromWalletAddress}`;
  
  const sig = await signer.signMessage(contextualMsg);
  return ethers.keccak256(ethers.toUtf8Bytes(sig));
}

// -------------------------
// Public API
// -------------------------

export async function wrapETHtoWETH(amountEth, signer = null) {
  if (!signer && typeof window !== 'undefined' && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
  }

  if (!signer) throw new Error('MetaMask not connected');
  if (!amountEth || isNaN(parseFloat(amountEth))) throw new Error('Valid amount required');

  const networkName = NetworkName.EthereumSepolia;
  const sepoliaConfig = NETWORK_CONFIG[networkName];
  const WETH_ADDRESS =
    sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

  const amountWei = ethers.parseEther(String(amountEth));

  const wethContract = new ethers.Contract(
    WETH_ADDRESS,
    ['function deposit() payable', 'function balanceOf(address) view returns (uint256)'],
    signer
  );

  const tx = await wethContract.deposit({ value: amountWei });
  const receipt = await tx.wait();

  return { success: true, txHash: receipt.hash };
}

export async function estimateShieldWETH(amountWeth, signer) {
  try {
    console.log('[Shield] ===== START estimateShieldWETH =====');

    if (!signer) return { success: false, error: 'Signer required' };
    if (!amountWeth || isNaN(parseFloat(amountWeth))) return { success: false, error: 'Valid amount required' };

    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    if (!stored?.walletID || !stored?.railgunAddress) {
      return { success: false, error: 'No Railgun wallet connected' };
    }

    // CRITICAL: Ensure SDK is initialized with provider loaded
    // This loads the network configuration internally which gasEstimateForShield needs
    console.log('[Shield] Ensuring SDK is initialized...');
    const initResult = await initializeSDK();
    if (!initResult.success) {
      return { success: false, error: `SDK initialization failed: ${initResult.error}` };
    }
    console.log('[Shield] SDK initialized successfully');

    // SDK functions need networkName (string), not chain object
    const networkName = NetworkName.EthereumSepolia;
    const sepoliaConfig = NETWORK_CONFIG[networkName];

    console.log('[Shield] Using networkName:', networkName);
    
    const WETH_ADDRESS =
      sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

    const fromWalletAddress = await signer.getAddress();
    const amountWei = ethers.parseEther(String(amountWeth));

    // Get shield private key
    const shieldPrivateKey = await getShieldPrivateKey(signer, fromWalletAddress);

    const erc20AmountRecipients = [
      {
        tokenAddress: WETH_ADDRESS,
        amount: amountWei.toString(),
        recipientAddress: stored.railgunAddress,
      },
    ];

    const nftAmountRecipients = [];

    console.log('[Shield] Attempting to call gasEstimateForShield...');

    try {
      // Try with V2 (primary version)
      console.log('[Shield] Attempting gasEstimateForShield with V2_PoseidonMerkle');
      const gasEstimate = await gasEstimateForShield(
        TXIDVersion.V2_PoseidonMerkle,
        networkName,
        shieldPrivateKey,
        erc20AmountRecipients,
        nftAmountRecipients,
        fromWalletAddress
      );

      console.log('[Shield] Gas estimate succeeded:', gasEstimate);
      return {
        success: true,
        gasEstimate: gasEstimate?.gasEstimate ?
          BigInt(gasEstimate.gasEstimate).toString() :
          BigInt(gasEstimate).toString()
      };
    } catch (error1) {
      console.log('[Shield] V2 failed, trying V3:', error1.message);

      // Fallback to V3
      try {
        const gasEstimate = await gasEstimateForShield(
          TXIDVersion.V3_PoseidonMerkle,
          networkName,
          shieldPrivateKey,
          erc20AmountRecipients,
          nftAmountRecipients,
          fromWalletAddress
        );

        console.log('[Shield] V3 gas estimate succeeded');
        return {
          success: true,
          gasEstimate: gasEstimate?.gasEstimate ?
            BigInt(gasEstimate.gasEstimate).toString() :
            BigInt(gasEstimate).toString()
        };
      } catch (error2) {
        console.log('[Shield] V3 also failed:', error2.message);
        throw new Error(`Gas estimation failed: ${error2.message}`);
      }
    }
    
  } catch (e) {
    console.error('[Shield] Estimate error:', e);
    return { success: false, error: e?.message || String(e) };
  } finally {
    console.log('[Shield] ===== END estimateShieldWETH =====');
  }
}

export async function shieldWETH(amountWeth, signer) {
  try {
    console.log('[Shield] ===== START shieldWETH =====');

    if (!signer) return { success: false, error: 'Signer required for shieldWETH' };
    if (!amountWeth || isNaN(parseFloat(amountWeth))) return { success: false, error: 'Valid amount required' };

    const stored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
    if (!stored?.walletID || !stored?.railgunAddress) {
      return { success: false, error: 'No Railgun wallet connected (missing walletID/railgunAddress).' };
    }

    // CRITICAL: Ensure SDK is initialized with provider loaded
    console.log('[Shield] Ensuring SDK is initialized...');
    const initResult = await initializeSDK();
    if (!initResult.success) {
      return { success: false, error: `SDK initialization failed: ${initResult.error}` };
    }

    const networkName = NetworkName.EthereumSepolia;
    const sepoliaConfig = NETWORK_CONFIG[networkName];
    const chain = sepoliaConfig?.chain; // Keep chain for refreshBalances

    if (!chain) {
      throw new Error('Could not get chain from NETWORK_CONFIG');
    }

    const WETH_ADDRESS =
      sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

    const provider = signer.provider;
    if (!provider) return { success: false, error: 'Provider not available from signer' };

    const fromWalletAddress = await signer.getAddress();
    const amountWei = ethers.parseEther(String(amountWeth));

    // 1) Approve WETH to proxy contract
    const spender = sepoliaConfig.proxyContract;
    console.log('[Shield] proxyContract:', spender);
    if (!spender) return { success: false, error: 'NETWORK_CONFIG[Sepolia].proxyContract missing' };

    const erc20 = new ethers.Contract(
      WETH_ADDRESS,
      [
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
      ],
      signer
    );

    const allowance = await erc20.allowance(fromWalletAddress, spender);
    if (allowance < amountWei) {
      console.log('[Shield] Approving', amountWei.toString(), 'WETH to spender:', spender);
      const approveTx = await erc20.approve(spender, amountWei);
      await approveTx.wait();
      console.log('[Shield] Approval confirmed');
    } else {
      console.log('[Shield] Allowance sufficient:', allowance.toString());
    }

    // 2) Get shield private key
    const shieldPrivateKey = await getShieldPrivateKey(signer, fromWalletAddress);

    // 3) Recipients
    const erc20AmountRecipients = [
      {
        tokenAddress: WETH_ADDRESS,
        amount: amountWei.toString(),
        recipientAddress: stored.railgunAddress,
      },
    ];
    
    const nftAmountRecipients = [];

    // 4) Estimate gas
    console.log('[Shield] Estimating gas...');
    const estimateResult = await estimateShieldWETH(amountWeth, signer);
    
    if (!estimateResult.success) {
      throw new Error(`Gas estimation failed: ${estimateResult.error}`);
    }
    
    console.log('[Shield] Gas estimate successful:', estimateResult.gasEstimate);

    // 5) Gas details
    const evmGasType = getEVMGasTypeForTransaction(networkName, true);
    const fee = await provider.getFeeData();

    let gasDetails;
    if (evmGasType === EVMGasType.Type2) {
      gasDetails = {
        evmGasType,
        gasEstimate: BigInt(estimateResult.gasEstimate),
        maxFeePerGas: BigInt(fee.maxFeePerGas ?? 0),
        maxPriorityFeePerGas: BigInt(fee.maxPriorityFeePerGas ?? 0),
      };
    } else {
      gasDetails = {
        evmGasType,
        gasEstimate: BigInt(estimateResult.gasEstimate),
        gasPrice: BigInt(fee.gasPrice ?? 0),
      };
    }

    // 6) Populate transaction
    console.log('[Shield] Populating shield transaction...');

    let populatedTransaction;
    try {
      populatedTransaction = await populateShield(
        TXIDVersion.V2_PoseidonMerkle,
        networkName,
        shieldPrivateKey,
        erc20AmountRecipients,
        nftAmountRecipients,
        gasDetails
      );
    } catch (error) {
      console.log('[Shield] Populate with V2 failed, trying V3:', error.message);
      populatedTransaction = await populateShield(
        TXIDVersion.V3_PoseidonMerkle,
        networkName,
        shieldPrivateKey,
        erc20AmountRecipients,
        nftAmountRecipients,
        gasDetails
      );
    }

    // 7) Send transaction
    console.log('[Shield] Sending shield transaction...');
    const transaction = populatedTransaction.transaction || populatedTransaction;
    const tx = await signer.sendTransaction(transaction);
    console.log('[Shield] Transaction sent, hash:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('[Shield] Shield transaction confirmed:', receipt.hash);

    // 8) Refresh balances (non-blocking - transaction already succeeded)
    console.log('[Shield] Refreshing balances for chain:', chain);
    try {
      const latestStored = JSON.parse(localStorage.getItem('railgun.wallet') || 'null');
      const walletIDForRefresh = latestStored?.walletID || stored.walletID;

      let walletLoaded = true;
      try {
        localWalletForID(walletIDForRefresh);
      } catch (_walletErr) {
        walletLoaded = false;
      }

      if (!walletLoaded) {
        console.warn(
          `[Shield] Wallet ${walletIDForRefresh} not loaded in local engine yet - skipping immediate refresh`,
        );
      } else {
        await localRefreshBalances(chain, [walletIDForRefresh]);

        try {
          await Promise.race([
            localAwaitWalletScan(walletIDForRefresh, chain),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Wallet scan timeout')), 8000),
            ),
          ]);
        } catch (scanError) {
          console.warn('[Shield] Wallet scan wait timed out (non-critical):', scanError.message);
        }

        console.log('[Shield] Balance refresh completed');
      }
    } catch (refreshError) {
      // Balance refresh failure is non-critical - transaction already confirmed
      console.warn('[Shield] Balance refresh failed (non-critical):', refreshError.message);
    }

    console.log('[Shield] Shield completed successfully');
    return { success: true, txHash: tx.hash };

  } catch (e) {
    console.error('[Shield] Shield failed:', e);
    return { success: false, error: e?.message || String(e) };
  } finally {
    console.log('[Shield] ===== END shieldWETH =====');
  }
}

export async function getWETHBalance(signer = null) {
  try {
    if (!signer && typeof window !== 'undefined' && window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
    }

    if (!signer) throw new Error('MetaMask not connected');

    const network = NetworkName.EthereumSepolia;
    const sepoliaConfig = NETWORK_CONFIG[network];
    const WETH_ADDRESS = sepoliaConfig?.baseToken?.wrappedAddress || '0xfff9976782d46cc05630d1f6ebab18b2324d6b14';

    const fromWalletAddress = await signer.getAddress();

    const wethContract = new ethers.Contract(
      WETH_ADDRESS,
      ['function balanceOf(address) view returns (uint256)'],
      signer
    );

    const balance = await wethContract.balanceOf(fromWalletAddress);
    return { success: true, balance: balance.toString() };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

const railgunShieldApi = {
  wrapETHtoWETH,
  estimateShieldWETH,
  shieldWETH,
  getWETHBalance,
};

export default railgunShieldApi;
