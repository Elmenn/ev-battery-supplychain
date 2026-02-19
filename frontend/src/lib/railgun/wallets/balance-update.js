/**
 * Balance Update
 * 
 * Handles balance updates and POI proof progress.
 * Converted from TypeScript to JavaScript.
 */

import {
  TokenType,
  NFTTokenData,
  getTokenDataHash,
  getTokenDataNFT,
  getTokenDataERC20,
} from '@railgun-community/engine';
import {
  NETWORK_CONFIG,
  NFTTokenType,
  RailgunWalletBalanceBucket,
  isDefined,
  networkForChain,
} from '@railgun-community/shared-models';
import { sendErrorMessage, sendMessage } from '../../../utils/logger.js';
import { parseRailgunTokenAddress } from '../util/bytes.js';
import { POIRequired } from '../../poi/poi-required.js';

let onBalanceUpdateCallback = null;
let onWalletPOIProofProgressCallback = null;

export const setOnBalanceUpdateCallback = (callback) => {
  onBalanceUpdateCallback = callback;
};

export const setOnWalletPOIProofProgressCallback = (callback) => {
  onWalletPOIProofProgressCallback = callback;
};

export const getSerializedERC20Balances = (balances) => {
  const tokenHashes = Object.keys(balances);

  return tokenHashes
    .filter(tokenHash => {
      return balances[tokenHash].tokenData.tokenType === TokenType.ERC20;
    })
    .map(railgunBalanceAddress => {
      const erc20Balance = {
        tokenAddress: parseRailgunTokenAddress(
          balances[railgunBalanceAddress].tokenData.tokenAddress,
        ).toLowerCase(),
        amount: balances[railgunBalanceAddress].balance,
      };
      return erc20Balance;
    });
};

export const getSerializedNFTBalances = (balances) => {
  const tokenHashes = Object.keys(balances);

  return tokenHashes
    .filter(tokenHash => {
      return [TokenType.ERC721, TokenType.ERC1155].includes(
        balances[tokenHash].tokenData.tokenType,
      );
    })
    .map(railgunBalanceAddress => {
      const balanceForToken = balances[railgunBalanceAddress];
      const tokenData = balanceForToken.tokenData;
      const nftBalance = {
        nftAddress: parseRailgunTokenAddress(
          tokenData.tokenAddress,
        ).toLowerCase(),
        tokenSubID: tokenData.tokenSubID,
        nftTokenType: tokenData.tokenType,
        amount: balanceForToken.balance,
      };
      return nftBalance;
    });
};

const getNFTBalances = (balances) => {
  const tokenHashes = Object.keys(balances);

  return tokenHashes
    .filter(tokenHash => {
      return (
        [TokenType.ERC721, TokenType.ERC1155].includes(
          balances[tokenHash].tokenData.tokenType,
        ) && balances[tokenHash].balance > BigInt(0)
      );
    })
    .map(tokenHash => {
      const tokenData = balances[tokenHash].tokenData;

      const nftBalance = {
        nftAddress: parseRailgunTokenAddress(
          tokenData.tokenAddress,
        ).toLowerCase(),
        nftTokenType: tokenData.tokenType,
        tokenSubID: tokenData.tokenSubID,
        amount: balances[tokenHash].balance,
      };
      return nftBalance;
    });
};

export const onBalancesUpdate = async (txidVersion, wallet, chain) => {
  try {
    if (!onBalanceUpdateCallback) {
      return;
    }

    sendMessage(
      `Wallet balance SCANNED. Getting balances for chain ${chain.type}:${chain.id}.`,
    );

    const network = networkForChain(chain);
    if (!network) {
      return;
    }
    if (!(await POIRequired.isRequiredForNetwork(network.name))) {
      // POI not required for this network
      return getAllBalancesAsSpendable(txidVersion, wallet, chain);
    }

    // POI required for this network
    const tokenBalancesByBucket = await wallet.getTokenBalancesByBucket(
      txidVersion,
      chain,
    );

    const balanceBuckets = Object.values(RailgunWalletBalanceBucket);

    balanceBuckets.forEach(balanceBucket => {
      if (!onBalanceUpdateCallback) {
        return;
      }

      const tokenBalances = tokenBalancesByBucket[balanceBucket];
      if (!isDefined(tokenBalances)) {
        return;
      }

      const erc20Amounts = getSerializedERC20Balances(tokenBalances);
      const nftAmounts = getNFTBalances(tokenBalances);

      const balancesEvent = {
        txidVersion,
        chain,
        erc20Amounts,
        nftAmounts,
        railgunWalletID: wallet.id,
        balanceBucket,
      };

      onBalanceUpdateCallback(balancesEvent);
    });
  } catch (err) {
    if (!(err instanceof Error)) {
      return;
    }
    sendMessage(
      `Error getting balances for chain ${chain.type}:${chain.id}: ${err.message}`,
    );
    sendErrorMessage(err);
  }
};

const getAllBalancesAsSpendable = async (txidVersion, wallet, chain) => {
  if (!onBalanceUpdateCallback) {
    return;
  }

  const tokenBalances = await wallet.getTokenBalances(
    txidVersion,
    chain,
    false, // onlySpendable
  );

  const erc20Amounts = getSerializedERC20Balances(tokenBalances);
  const nftAmounts = getNFTBalances(tokenBalances);

  const balancesEvent = {
    txidVersion,
    chain,
    erc20Amounts,
    nftAmounts,
    railgunWalletID: wallet.id,
    balanceBucket: RailgunWalletBalanceBucket.Spendable,
  };

  onBalanceUpdateCallback(balancesEvent);
};

export const onWalletPOIProofProgress = (
  status,
  txidVersion,
  wallet,
  chain,
  progress,
  listKey,
  txid,
  railgunTxid,
  index,
  totalCount,
  errMessage,
) => {
  sendMessage(
    `[${listKey}, ${chain.type}:${chain.id}] Wallet POI proof progress: ${progress}.`,
  );
  if (!onWalletPOIProofProgressCallback) {
    return;
  }

  const poiProofEvent = {
    status,
    txidVersion,
    chain,
    railgunWalletID: wallet.id,
    progress,
    listKey,
    txid,
    railgunTxid,
    index,
    totalCount,
    errMessage,
  };

  onWalletPOIProofProgressCallback(poiProofEvent);
};

export const balanceForERC20Token = async (
  txidVersion,
  wallet,
  networkName,
  tokenAddress,
  onlySpendable,
) => {
  // CRITICAL: Ensure network config is available before accessing
  const network = NETWORK_CONFIG[networkName];
  if (!network || !network.chain) {
    console.warn(`⚠️ Network config not found for ${networkName} - returning 0 balance`);
    return 0n;
  }

  const { chain } = network;
  
  try {
    // Wrap in try-catch to handle SDK internal POI errors gracefully
    const balances = await wallet.getTokenBalances(
      txidVersion,
      chain,
      onlySpendable,
    );
    
    if (!balances) {
      console.warn('⚠️ No balances returned from wallet.getTokenBalances');
      return 0n;
    }
    
    const tokenBalances = getSerializedERC20Balances(balances);

    const matchingTokenBalance = tokenBalances.find(
      tokenBalance =>
        tokenBalance.tokenAddress.toLowerCase() === tokenAddress.toLowerCase(),
    );
    if (!matchingTokenBalance) {
      return 0n;
    }
    return matchingTokenBalance.amount;
  } catch (error) {
    // Handle POI/internal SDK errors gracefully
    if (error.message && error.message.includes('isRequired')) {
      console.warn('⚠️ POI check failed (network config may not be fully initialized):', error.message);
      console.warn('⚠️ Returning 0 balance - balances may be available after network initialization completes');
      return 0n;
    }
    // Re-throw other errors
    throw error;
  }
};

export const balanceForNFT = async (
  txidVersion,
  wallet,
  networkName,
  nftTokenData,
  onlySpendable,
) => {
  const { chain } = NETWORK_CONFIG[networkName];
  const balances = await wallet.getTokenBalances(
    txidVersion,
    chain,
    onlySpendable,
  );
  const nftBalances = getSerializedNFTBalances(balances);

  const matchingNFTBalance = nftBalances.find(
    nftBalance =>
      nftBalance.nftAddress.toLowerCase() ===
        nftTokenData.tokenAddress.toLowerCase() &&
      BigInt(nftBalance.tokenSubID) === BigInt(nftTokenData.tokenSubID),
  );
  if (!matchingNFTBalance) {
    return 0n;
  }
  return matchingNFTBalance.amount;
};

export {
  getTokenDataHash,
  getTokenDataNFT,
  getTokenDataERC20,
  TokenType,
  NFTTokenType,
  NFTTokenData,
};


