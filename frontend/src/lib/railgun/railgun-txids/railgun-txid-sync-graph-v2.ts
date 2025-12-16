import {
  Chain,
  RailgunTransaction,
  RailgunTransactionV2,
  getRailgunTransactionIDHex,
} from '@railgun-community/engine';
import {
  NetworkName,
  isDefined,
  networkForChain,
} from '@railgun-community/shared-models';
import {
  GraphRailgunTransactions,
  formatRailgunTransactions,
} from './railgun-txid-graph-type-formatters';
import { removeDuplicatesByID } from '../util/graph-util';
import { fetchTxidTransactionsFromGraph } from './quick-sync/quick-sync-txid-graph-v2';
import { getTxidGraphSDK } from './quick-sync/txid-graphql-client';

const MAX_QUERY_RESULTS = 5000;

export const getRailgunTxDataForUnshields = async (
  chain: Chain,
  txid: string,
): Promise<
  {
    railgunTransaction: RailgunTransactionV2;
    railgunTxid: string;
  }[]
> => {
  const network = networkForChain(chain);
  if (!network) {
    return [];
  }

  const sdk = getTxidGraphSDK(network.name);

  const transactions: GraphRailgunTransactions = (
    await sdk.GetRailgunTransactionsByTxid({ txid })
  ).transactions;

  const railgunTxidsForUnshields: {
    railgunTransaction: RailgunTransactionV2;
    railgunTxid: string;
  }[] = transactions
    .filter(transaction => transaction.hasUnshield)
    .map(transaction => {
      const railgunTransaction = formatRailgunTransactions([transaction])[0];
      const railgunTxid = getRailgunTransactionIDHex(transaction);
      return { railgunTxid, railgunTransaction };
    });

  return railgunTxidsForUnshields;
};

export const getRailgunTxidsForUnshields = async (
  chain: Chain,
  txid: string,
): Promise<string[]> => {
  const network = networkForChain(chain);
  if (!network) {
    return [];
  }

  const sdk = getTxidGraphSDK(network.name);

  const transactions: GraphRailgunTransactions = (
    await sdk.GetRailgunTransactionsByTxid({ txid })
  ).transactions;

  const railgunTxidsForUnshields: string[] = transactions
    .filter(transaction => transaction.hasUnshield)
    .map(transaction => {
      const railgunTxid = getRailgunTransactionIDHex(transaction);
      return railgunTxid;
    });

  return railgunTxidsForUnshields;
};

export const getRailgunTransactionDataForUnshieldToAddress = async (
  chain: Chain,
  unshieldToAddress: string,
): Promise<
  {
    txid: string;
    transactionDatas: {
      railgunTransaction: RailgunTransactionV2;
      railgunTxid: string;
    }[];
  }[]
> => {
  const network = networkForChain(chain);
  if (!network) {
    return [];
  }

  const sdk = getTxidGraphSDK(network.name);

  const transactions: GraphRailgunTransactions = (
    await sdk.GetRailgunTransactionsByUnshieldToAddress({
      address: unshieldToAddress,
    })
  ).transactions;
  const uniqueTxidMap = new Map<string, string[]>();
  const railgunTxidToTransactionMap = new Map<string, RailgunTransactionV2>();

  transactions
    .filter(transaction => transaction.hasUnshield)
    .forEach(transaction => {
      const railgunTxid = getRailgunTransactionIDHex(transaction);
      railgunTxidToTransactionMap.set(
        railgunTxid,
        formatRailgunTransactions([transaction])[0],
      );
      if (uniqueTxidMap.has(transaction.transactionHash)) {
        const railgunTxids = uniqueTxidMap.get(
          transaction.transactionHash,
        ) as string[];
        railgunTxids.push(railgunTxid);
        uniqueTxidMap.set(transaction.transactionHash, railgunTxids);
      } else {
        uniqueTxidMap.set(transaction.transactionHash, [railgunTxid]);
      }
    });
  const railgunTxidsForUnshields: {
    txid: string;
    transactionDatas: {
      railgunTransaction: RailgunTransactionV2;
      railgunTxid: string;
    }[];
  }[] = [];
  uniqueTxidMap.forEach((railgunTxids, txid) => {
    railgunTxidsForUnshields.push({
      txid,
      transactionDatas: railgunTxids.map(railgunTxid => {
        const railgunTransaction = railgunTxidToTransactionMap.get(railgunTxid);
        if (!railgunTransaction) {
          throw new Error(
            `Could not find railgun transaction for txid ${txid}`,
          );
        }
        return { railgunTransaction, railgunTxid };
      }),
    });
  });

  return railgunTxidsForUnshields;
};

export const getRailgunTransactionsForTxid = async (
  chain: Chain,
  txid: string,
): Promise<RailgunTransaction[]> => {
  const network = networkForChain(chain);
  if (!network) {
    return [];
  }

  const sdk = getTxidGraphSDK(network.name);

  const railgunTransactions: GraphRailgunTransactions = (
    await sdk.GetRailgunTransactionsByTxid({ txid })
  ).transactions;

  const filteredRailgunTransactions: GraphRailgunTransactions =
    removeDuplicatesByID(railgunTransactions);

  const formattedRailgunTransactions: RailgunTransaction[] =
    formatRailgunTransactions(filteredRailgunTransactions);

  return formattedRailgunTransactions;
};

export const quickSyncRailgunTransactionsV2 = async (
  chain: Chain,
  latestGraphID: Optional<string>,
  startingBlockNumber?: Optional<number>,
): Promise<RailgunTransactionV2[]> => {
  // Check for pending on-chain transactions (injected by scan-and-build-txids endpoint)
  const pendingTxidsKey = '__pending_txid_transactions__';
  const pending = (global as any)?.[pendingTxidsKey];
  if (pending && Array.isArray(pending) && pending.length > 0) {
    console.log(`[QUICKSYNC-TXID] 🎯 Injecting ${pending.length} on-chain transactions into sync pipeline`);
    
    // Log sample transaction structure for debugging
    if (pending.length > 0) {
      const sample = pending[0];
      console.log(`[QUICKSYNC-TXID] Sample injected transaction:`);
      console.log(`[QUICKSYNC-TXID]   - version: ${sample.version}`);
      console.log(`[QUICKSYNC-TXID]   - blockNumber: ${sample.blockNumber}`);
      console.log(`[QUICKSYNC-TXID]   - txid: ${sample.txid ? sample.txid.slice(0, 32) + '...' : 'MISSING'}`);
      console.log(`[QUICKSYNC-TXID]   - commitments: ${sample.commitments?.length || 0}`);
      console.log(`[QUICKSYNC-TXID]   - nullifiers: ${sample.nullifiers?.length || 0}`);
      console.log(`[QUICKSYNC-TXID]   - boundParamsHash: ${sample.boundParamsHash ? 'present' : 'MISSING'}`);
      console.log(`[QUICKSYNC-TXID]   - verificationHash: ${sample.verificationHash ? 'present' : 'MISSING'}`);
      console.log(`[QUICKSYNC-TXID]   - utxoTreeOut: ${sample.utxoTreeOut}`);
      console.log(`[QUICKSYNC-TXID]   - utxoBatchStartPositionOut: ${sample.utxoBatchStartPositionOut}`);
    }
    
    // CRITICAL: Do NOT clear global here - let the caller clear it after verifying successful append
    // DO NOT continue into GraphQL sync in this invocation - return immediately
    // The global will be cleared by the caller after verifying the append succeeded
    return pending;
  }
  
  const network = networkForChain(chain);
  if (!network || !isDefined(network.poi)) {
    console.log(`[QUICKSYNC-TXID] ⚠️  Skipping TXID sync - network: ${network?.name}, hasPOI: ${isDefined(network?.poi)}`);
    return [];
  }

  console.log(`[QUICKSYNC-TXID] Starting TXID quick-sync for ${network.name}, latestGraphID: ${latestGraphID ?? '0x00'}`);

  let fallbackBlockNumber = startingBlockNumber;
  if (!isDefined(fallbackBlockNumber)) {
    // Try to get block number from local merkletree (same pattern as UTXO quick-sync gets startingBlock)
    // This automatically extracts the block number when id_gt query fails
    try {
      const { getEngine } = require('../core/engine');
      const { TXIDVersion } = require('@railgun-community/engine');
      const engine = getEngine();
      if (engine) {
        // Get latest TXID data from engine (same as getLatestRailgunTxidData helper)
        const latestTxidData = await engine.getLatestRailgunTxidData(TXIDVersion.V2_PoseidonMerkle, chain);
        if (latestTxidData && latestTxidData.txidIndex >= 0) {
          const txidMerkletree = engine.getTXIDMerkletree(TXIDVersion.V2_PoseidonMerkle, chain);
          if (txidMerkletree) {
            // Get the actual transaction to extract block number
            const latestTx = await txidMerkletree.getRailgunTransaction(0, latestTxidData.txidIndex);
            if (latestTx && (latestTx as any).blockNumber) {
              fallbackBlockNumber = (latestTx as any).blockNumber + 1; // Start from next block
              console.log(`[QUICKSYNC-TXID] 📍 Auto-detected starting block from local merkletree: ${fallbackBlockNumber} (last tx was at block ${(latestTx as any).blockNumber}, index ${latestTxidData.txidIndex})`);
            }
          }
        }
      }
    } catch (e: any) {
      console.log(`[QUICKSYNC-TXID] ⚠️  Could not auto-detect block number: ${e?.message}`);
      console.log(`[QUICKSYNC-TXID]    This is fine - fallback will only work if block number is provided or auto-detected`);
    }
  }
  const graphTransactions = await fetchTxidTransactionsFromGraph(
    chain,
    latestGraphID,
    fallbackBlockNumber,
    MAX_QUERY_RESULTS,
  );

  console.log(`[QUICKSYNC-TXID] Total transactions fetched from GraphQL: ${graphTransactions.length}`);

  if (graphTransactions.length > 0) {
    const sample = graphTransactions[0];
    console.log(`[QUICKSYNC-TXID] Sample tx details:`);
    console.log(`[QUICKSYNC-TXID]   - blockNumber: ${sample.blockNumber}`);
    console.log(`[QUICKSYNC-TXID]   - timestamp: ${sample.timestamp}`);
    console.log(`[QUICKSYNC-TXID]   - graphID: ${sample.graphID?.slice(0, 32)}...`);
    console.log(`[QUICKSYNC-TXID]   - txid: ${sample.txid ? sample.txid.slice(0, 32) + '...' : 'MISSING ❌'}`);
    console.log(`[QUICKSYNC-TXID]   - commitments: ${sample.commitments?.length || 0}`);
    console.log(`[QUICKSYNC-TXID]   - nullifiers: ${sample.nullifiers?.length || 0}`);
    console.log(`[QUICKSYNC-TXID]   - boundParamsHash: ${sample.boundParamsHash ? sample.boundParamsHash.slice(0, 32) + '...' : 'MISSING ❌'}`);
    console.log(`[QUICKSYNC-TXID]   - verificationHash: ${sample.verificationHash ? sample.verificationHash.slice(0, 32) + '...' : 'MISSING ❌'}`);
    console.log(`[QUICKSYNC-TXID]   - utxoTreeIn: ${sample.utxoTreeIn}, utxoTreeOut: ${sample.utxoTreeOut}`);
    console.log(`[QUICKSYNC-TXID]   - utxoBatchStartPositionOut: ${sample.utxoBatchStartPositionOut}`);
    console.log(`[QUICKSYNC-TXID]   - hasUnshield: ${!!sample.unshield}`);
    
    // Check if critical fields are missing
    if (!sample.boundParamsHash) {
      console.log(`[QUICKSYNC-TXID] ⚠️  WARNING: Sample transaction missing boundParamsHash!`);
    }
    if (!sample.verificationHash) {
      console.log(`[QUICKSYNC-TXID] ⚠️  WARNING: Sample transaction missing verificationHash!`);
    }
    if (!sample.txid) {
      console.log(`[QUICKSYNC-TXID] ⚠️  WARNING: Sample transaction missing txid!`);
    }
  } else {
    console.log(`[QUICKSYNC-TXID] ℹ️  No new transactions to sync (already up to date, or GraphQL subgraph may need more time to index)`);
  }

  return graphTransactions;
};
