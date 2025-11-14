// utils/errorHandler.js
// Utility functions for better error handling and user feedback

import { ethers } from "ethers";

/**
 * Extract user-friendly error message from Ethereum transaction error
 * @param {Error} error - The error object
 * @returns {string} - User-friendly error message
 */
export function extractErrorMessage(error) {
  if (!error) return "An unknown error occurred";

  // Handle ethers.js errors
  if (error.reason) {
    return error.reason;
  }

  // Handle contract revert errors
  if (error.data) {
    try {
      // Try to decode the error data
      if (typeof error.data === 'string') {
        // Check for common error messages in the data
        if (error.data.includes('insufficient funds')) {
          return "Insufficient funds for this transaction";
        }
        if (error.data.includes('user rejected')) {
          return "Transaction was rejected by user";
        }
        if (error.data.includes('nonce too low')) {
          return "Transaction nonce error - please try again";
        }
      }
    } catch (e) {
      // If decoding fails, fall through to generic message
    }
  }

  // Handle custom error messages
  if (error.message) {
    // Check for common error patterns
    const message = error.message.toLowerCase();
    
    if (message.includes('user rejected') || message.includes('user denied')) {
      return "Transaction was cancelled by user";
    }
    if (message.includes('insufficient funds')) {
      return "Insufficient funds for this transaction";
    }
    if (message.includes('network') || message.includes('timeout')) {
      return "Network error - please check your connection and try again";
    }
    if (message.includes('nonce')) {
      return "Transaction nonce error - please try again";
    }
    if (message.includes('gas')) {
      return "Gas estimation failed - the transaction may fail. Please check the contract state.";
    }
    if (message.includes('revert')) {
      // Try to extract the revert reason
      const revertMatch = error.message.match(/revert\s+(.+)/i);
      if (revertMatch) {
        return `Transaction failed: ${revertMatch[1]}`;
      }
      return "Transaction failed - the contract rejected this operation";
    }
    if (message.includes('execution reverted')) {
      // Try to extract custom error name
      const errorMatch = error.message.match(/execution reverted\s+([A-Za-z]+)/);
      if (errorMatch) {
        return `Transaction failed: ${errorMatch[1]}`;
      }
      return "Transaction failed - the contract rejected this operation";
    }
    
    // Return the original message if it's user-friendly
    return error.message;
  }

  // Fallback to generic error
  return "An unknown error occurred - please try again";
}

/**
 * Extract transaction hash from error or transaction object
 * @param {Error|Object} errorOrTx - Error or transaction object
 * @returns {string|null} - Transaction hash if available
 */
export function extractTransactionHash(errorOrTx) {
  if (!errorOrTx) return null;

  // Check if it's a transaction object
  if (errorOrTx.hash) {
    return errorOrTx.hash;
  }

  // Check if it's an error with transaction data
  if (errorOrTx.transaction?.hash) {
    return errorOrTx.transaction.hash;
  }

  // Check if it's an error with receipt
  if (errorOrTx.receipt?.transactionHash) {
    return errorOrTx.receipt.transactionHash;
  }

  return null;
}

/**
 * Get blockchain explorer URL for a transaction hash
 * @param {string} txHash - Transaction hash
 * @param {string|number} chainId - Chain ID (default: 11155111 for Sepolia)
 * @returns {string|null} - Explorer URL or null if chain not supported
 */
export function getExplorerUrl(txHash, chainId = 11155111) {
  if (!txHash) return null;

  const explorerMap = {
    1: 'https://etherscan.io/tx/',
    11155111: 'https://sepolia.etherscan.io/tx/',
    137: 'https://polygonscan.com/tx/',
    80001: 'https://mumbai.polygonscan.com/tx/',
    1337: null, // Local network
  };

  const baseUrl = explorerMap[chainId] || explorerMap[11155111];
  return baseUrl ? `${baseUrl}${txHash}` : null;
}

/**
 * Format error with transaction link if available
 * @param {Error} error - The error object
 * @param {string|number} chainId - Chain ID
 * @returns {Object} - { message: string, txHash: string|null, explorerUrl: string|null }
 */
export function formatErrorWithTxLink(error, chainId = 11155111) {
  const message = extractErrorMessage(error);
  const txHash = extractTransactionHash(error);
  const explorerUrl = txHash ? getExplorerUrl(txHash, chainId) : null;

  return {
    message,
    txHash,
    explorerUrl,
  };
}

/**
 * Check if error is recoverable (user can retry)
 * @param {Error} error - The error object
 * @returns {boolean} - True if error is recoverable
 */
export function isRecoverableError(error) {
  if (!error) return false;

  const message = error.message?.toLowerCase() || '';
  
  // Recoverable errors
  const recoverablePatterns = [
    'network',
    'timeout',
    'nonce',
    'user rejected',
    'user denied',
    'insufficient funds', // User can add funds and retry
  ];

  return recoverablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Check if error is a contract revert (non-recoverable without changing inputs)
 * @param {Error} error - The error object
 * @returns {boolean} - True if error is a contract revert
 */
export function isContractRevert(error) {
  if (!error) return false;

  const message = error.message?.toLowerCase() || '';
  return message.includes('revert') || message.includes('execution reverted');
}

