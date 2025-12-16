/**
 * Utilities to query Railgun contract on-chain state
 * This helps diagnose merkleroot mismatches between local and on-chain state
 */

import { ethers, EventLog } from 'ethers';
import { NetworkName, Chain } from '@railgun-community/shared-models';
import { getFallbackProviderForNetwork } from './core/providers';

// Railgun Smart Wallet Contract V3 ABI (minimal - just what we need for diagnostics)
const RAILGUN_SMART_WALLET_ABI = [
  // TXID merkletree state
  'function latestState() external view returns (uint256 latestLeafIndex, bytes32 latestMerkleroot)',
  'function getHistoricalMerkleroot(uint256 tree, uint256 leafIndex) external view returns (bytes32)',
  // V2 contract might have different function names - try these
  'function txidMerkleroot(uint256) external view returns (bytes32)',
  'function merkleroot(uint256) external view returns (bytes32)',
  // Events that might indicate state changes
  'event Transaction(bytes32 indexed txid, uint256 indexed merkleRoot, uint256 indexed nullifiers)',
];

export interface RailgunContractState {
  latestLeafIndex: bigint;
  latestMerkleroot: string;
  contractAddress: string;
  blockNumber: number;
}

/**
 * Query the Railgun contract to get the current on-chain TXID merkletree state
 */
export const getRailgunContractOnChainState = async (
  networkName: NetworkName,
  chain: Chain,
): Promise<RailgunContractState | null> => {
  try {
    const provider = getFallbackProviderForNetwork(networkName);
    const network = require('@railgun-community/shared-models').networkForChain(chain);
    // Try V2 first (for Sepolia), then V3, then fallback
    let contractAddress = network?.contracts?.railgunSmartWalletContractV2 || network?.contracts?.railgunSmartWalletContractV3;
    
    // Fallback for Sepolia V2 (chain ID 11155111)
    if (!contractAddress && chain.id === 11155111) {
      contractAddress = '0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea'; // Sepolia V2 contract
      console.log('[CONTRACT-QUERY] Using fallback Sepolia V2 contract address');
    }
    
    if (!contractAddress) {
      console.error('[CONTRACT-QUERY] No Railgun contract address found for network');
      console.error('[CONTRACT-QUERY] Available contracts:', {
        v2: network?.contracts?.railgunSmartWalletContractV2,
        v3: network?.contracts?.railgunSmartWalletContractV3,
        chainId: chain.id,
      });
      return null;
    }
    
    const isV2 = chain.id === 11155111 || contractAddress.toLowerCase() === '0xecfcf3b4ec647c4ca6d49108b311b7a7c9543fea';
    console.log(`[CONTRACT-QUERY] Using contract: ${contractAddress} (${isV2 ? 'V2' : 'V3'})`);
    
    console.log(`[CONTRACT-QUERY] Querying Railgun contract on-chain state...`);
    console.log(`[CONTRACT-QUERY] Contract: ${contractAddress}`);
    
    const contract = new ethers.Contract(contractAddress, RAILGUN_SMART_WALLET_ABI, provider);
    
    // Try to get latest state
    let latestLeafIndex: bigint;
    let latestMerkleroot: string;
    
    try {
      // V2 might not have latestState(), so try it first, then fall back to events or historical query
      const state = await contract.latestState();
      latestLeafIndex = state.latestLeafIndex;
      latestMerkleroot = state.latestMerkleroot;
      console.log(`[CONTRACT-QUERY] ✅ Got on-chain state from latestState():`);
      console.log(`[CONTRACT-QUERY]    Latest Leaf Index: ${latestLeafIndex.toString()}`);
      console.log(`[CONTRACT-QUERY]    Latest Merkleroot: ${latestMerkleroot}`);
    } catch (error: any) {
      console.log(`[CONTRACT-QUERY] ⚠️  latestState() not available (V2 may not have this function): ${error?.message}`);
      
      // Try to get historical merkleroot at a known index (e.g., 1020 from POI node)
      // This is more reliable than event queries
      try {
        console.log(`[CONTRACT-QUERY] Attempting to query historical merkleroot at index 1020 (from POI node)...`);
        const historicalMerkleroot = await contract.getHistoricalMerkleroot(0, 1020);
        if (historicalMerkleroot && historicalMerkleroot !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          latestMerkleroot = historicalMerkleroot;
          latestLeafIndex = BigInt(1020); // We know this is at least index 1020
          console.log(`[CONTRACT-QUERY] ✅ Got historical merkleroot from getHistoricalMerkleroot(0, 1020):`);
          console.log(`[CONTRACT-QUERY]    Merkleroot at index 1020: ${latestMerkleroot}`);
          console.log(`[CONTRACT-QUERY]    ⚠️  Index is approximate (at least 1020, actual latest may be higher)`);
        } else {
          throw new Error('Historical merkleroot returned zero');
        }
      } catch (historicalError: any) {
        console.log(`[CONTRACT-QUERY] ⚠️  getHistoricalMerkleroot() not available: ${historicalError?.message}`);
        console.log(`[CONTRACT-QUERY] Attempting to infer state from recent Transaction events...`);
        
        // Get current block
        const currentBlock = await provider.getBlockNumber();
        // Use smaller range to avoid RPC limits (most RPCs limit to 1000-2000 blocks)
        const blockRange = 500; // Smaller range to avoid "invalid block range params" error
        const fromBlock = Math.max(0, currentBlock - blockRange);
        console.log(`[CONTRACT-QUERY] Querying Transaction events from block ${fromBlock} to ${currentBlock} (${blockRange} blocks)...`);
        
        // Query recent Transaction events (smaller range to avoid RPC limits)
        const filter = contract.filters.Transaction();
        let events;
        try {
          events = await contract.queryFilter(filter, fromBlock, currentBlock);
        } catch (rangeError: any) {
          // If range is still too large, try even smaller
          if (rangeError?.message?.includes('block range') || rangeError?.code === -32000) {
            console.log(`[CONTRACT-QUERY] ⚠️  Block range too large, trying smaller range (100 blocks)...`);
            const smallRange = 100;
            const smallFromBlock = Math.max(0, currentBlock - smallRange);
            events = await contract.queryFilter(filter, smallFromBlock, currentBlock);
          } else {
            throw rangeError;
          }
        }
        
        console.log(`[CONTRACT-QUERY] Found ${events.length} Transaction events`);
        
        if (events.length > 0) {
          const latestEvent = events[events.length - 1];
          // Type guard: check if it's an EventLog (has args) vs Log (doesn't)
          if (latestEvent instanceof EventLog && latestEvent.args) {
            latestMerkleroot = latestEvent.args.merkleRoot;
            // For V2, the index in the event might be the txidIndex
            // But we can't get it directly, so we'll use the event count as approximation
            latestLeafIndex = BigInt(events.length - 1); // Approximation - not accurate!
            console.log(`[CONTRACT-QUERY] ⚠️  Inferred from events (APPROXIMATE - not accurate for index):`);
            console.log(`[CONTRACT-QUERY]    Latest Merkleroot: ${latestMerkleroot}`);
            console.log(`[CONTRACT-QUERY]    Approximate Index: ${latestLeafIndex.toString()} (from event count)`);
            console.log(`[CONTRACT-QUERY]    ⚠️  WARNING: Index is approximate. Use merkleroot for comparison.`);
          } else {
            throw new Error('Event log does not have args property');
          }
        } else {
          throw new Error('Could not get contract state from latestState() or events');
        }
      }
    }
    
    const blockNumber = await provider.getBlockNumber();
    
    return {
      latestLeafIndex,
      latestMerkleroot,
      contractAddress,
      blockNumber,
    };
  } catch (error: any) {
    console.error(`[CONTRACT-QUERY] ❌ Error querying contract: ${error?.message}`);
    return null;
  }
};




