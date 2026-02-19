import {
  TXIDVersion,
  ByteLength,
  ByteUtils,
  RailgunTransactionVersion,
  TokenType,
} from '@railgun-community/engine';
import {
  NetworkName,
  delay,
  isDefined,
  networkForChain,
} from '@railgun-community/shared-models';
import { getAddress } from 'ethers';

const PAGE_SIZE = 5000;
const MAX_QUERY_RESULTS = 5000;

const GET_TRANSACTIONS_AFTER_ID_QUERY = `
  query GetRailgunTransactionsAfterGraphID($idLow: String = "0x00") {
    transactions(orderBy: id_ASC, limit: 5000, where: { id_gt: $idLow }) {
      id
      nullifiers
      commitments
      transactionHash
      boundParamsHash
      blockNumber
      utxoTreeIn
      utxoTreeOut
      utxoBatchStartPositionOut
      hasUnshield
      unshieldToken {
        tokenType
        tokenSubID
        tokenAddress
      }
      unshieldToAddress
      unshieldValue
      blockTimestamp
      verificationHash
    }
  }
`;

const GET_TRANSACTIONS_BY_BLOCK_QUERY = `
  query GetRailgunTransactionsByBlockNumber($blockNumber: BigInt = "0") {
    transactions(
      orderBy: blockNumber_ASC
      limit: 5000
      where: { blockNumber_gte: $blockNumber }
    ) {
      id
      nullifiers
      commitments
      transactionHash
      boundParamsHash
      blockNumber
      utxoTreeIn
      utxoTreeOut
      utxoBatchStartPositionOut
      hasUnshield
      unshieldToken {
        tokenType
        tokenSubID
        tokenAddress
      }
      unshieldToAddress
      unshieldValue
      blockTimestamp
      verificationHash
    }
  }
`;

const env = (name) =>
  (typeof process !== 'undefined' && process?.env ? process.env[name] : undefined) ||
  undefined;

const sourceUrlForNetwork = (networkName) => {
  const envOverrideMap = {
    [NetworkName.Ethereum]: env('REACT_APP_RAILGUN_ETHEREUM_V2_SUBGRAPH_URL') || env('RAILGUN_ETHEREUM_V2_SUBGRAPH_URL'),
    [NetworkName.EthereumSepolia]:
      env('REACT_APP_RAILGUN_SEPOLIA_V2_SUBGRAPH_URL') ||
      env('RAILGUN_SEPOLIA_V2_SUBGRAPH_URL') ||
      (typeof window !== 'undefined' ? window.__OVERRIDE_SEPOLIA_V2_SUBGRAPH__ : undefined),
    [NetworkName.BNBChain]: env('REACT_APP_RAILGUN_BSC_V2_SUBGRAPH_URL') || env('RAILGUN_BSC_V2_SUBGRAPH_URL'),
    [NetworkName.Polygon]: env('REACT_APP_RAILGUN_POLYGON_V2_SUBGRAPH_URL') || env('RAILGUN_POLYGON_V2_SUBGRAPH_URL'),
    [NetworkName.Arbitrum]: env('REACT_APP_RAILGUN_ARBITRUM_V2_SUBGRAPH_URL') || env('RAILGUN_ARBITRUM_V2_SUBGRAPH_URL'),
  };

  if (envOverrideMap[networkName]) {
    return envOverrideMap[networkName];
  }

  switch (networkName) {
    case NetworkName.Ethereum:
      return 'https://rail-squid.squids.live/squid-railgun-ethereum-v2/graphql';
    case NetworkName.EthereumSepolia:
      return 'https://rail-squid.squids.live/squid-railgun-eth-sepolia-v2/graphql';
    case NetworkName.BNBChain:
      return 'https://rail-squid.squids.live/squid-railgun-bsc-v2/graphql';
    case NetworkName.Polygon:
      return 'https://rail-squid.squids.live/squid-railgun-polygon-v2/graphql';
    case NetworkName.Arbitrum:
      return 'https://rail-squid.squids.live/squid-railgun-arbitrum-v2/graphql';
    default:
      return null;
  }
};

const graphRequest = async (url, query, variables) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Graph request failed (${response.status})`);
  }

  const data = await response.json();
  if (data?.errors?.length) {
    throw new Error(data.errors.map(err => err.message).join('; '));
  }
  return data?.data ?? {};
};

const removeDuplicatesByID = (items) => {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const graphTokenTypeToEngineTokenType = (graphTokenType) => {
  switch (graphTokenType) {
    case 'ERC20':
      return TokenType.ERC20;
    case 'ERC721':
      return TokenType.ERC721;
    case 'ERC1155':
      return TokenType.ERC1155;
    default:
      return TokenType.ERC20;
  }
};

const formatRailgunTransactions = (txs) => {
  return txs.map(tx => {
    const unshield = tx.hasUnshield && tx.unshieldToken
      ? {
          tokenData: {
            tokenType: graphTokenTypeToEngineTokenType(tx.unshieldToken.tokenType),
            tokenAddress: getAddress(tx.unshieldToken.tokenAddress),
            tokenSubID: tx.unshieldToken.tokenSubID,
          },
          toAddress: tx.unshieldToAddress,
          value: tx.unshieldValue,
        }
      : undefined;

    return {
      version: RailgunTransactionVersion.V2,
      graphID: tx.id,
      commitments: tx.commitments.map(commitment =>
        ByteUtils.formatToByteLength(commitment, ByteLength.UINT_256, true),
      ),
      nullifiers: tx.nullifiers.map(nullifier =>
        ByteUtils.formatToByteLength(nullifier, ByteLength.UINT_256, true),
      ),
      boundParamsHash: ByteUtils.formatToByteLength(
        tx.boundParamsHash,
        ByteLength.UINT_256,
        true,
      ),
      blockNumber: Number(tx.blockNumber),
      timestamp: Number(tx.blockTimestamp),
      utxoTreeIn: Number(tx.utxoTreeIn),
      utxoTreeOut: Number(tx.utxoTreeOut),
      utxoBatchStartPositionOut: Number(tx.utxoBatchStartPositionOut),
      txid: ByteUtils.formatToByteLength(
        tx.transactionHash,
        ByteLength.UINT_256,
        false,
      ),
      unshield,
      verificationHash: ByteUtils.formatToByteLength(
        tx.verificationHash,
        ByteLength.UINT_256,
        true,
      ),
    };
  });
};

const autoPaginateById = async (graphqlUrl, startingId, maxResults) => {
  let cursor = startingId;
  let aggregated = [];

  while (true) {
    const data = await graphRequest(graphqlUrl, GET_TRANSACTIONS_AFTER_ID_QUERY, {
      idLow: cursor,
    });
    const results = data.transactions ?? [];
    if (results.length === 0) break;

    aggregated = aggregated.concat(results);
    if (aggregated.length >= maxResults) break;

    cursor = results[results.length - 1].id;
    if (results.length === PAGE_SIZE) {
      await delay(250);
    } else {
      break;
    }
  }

  return aggregated;
};

const autoPaginateByBlockNumber = async (graphqlUrl, startingBlock, maxResults) => {
  let cursor = BigInt(startingBlock);
  let aggregated = [];

  while (true) {
    const data = await graphRequest(graphqlUrl, GET_TRANSACTIONS_BY_BLOCK_QUERY, {
      blockNumber: cursor.toString(),
    });
    const results = data.transactions ?? [];
    if (results.length === 0) break;

    aggregated = aggregated.concat(results);
    if (aggregated.length >= maxResults) break;

    if (results.length === PAGE_SIZE) {
      let highestBlockTx = results[0];
      for (const tx of results) {
        if (BigInt(tx.blockNumber) > BigInt(highestBlockTx.blockNumber)) {
          highestBlockTx = tx;
        }
      }
      cursor = BigInt(highestBlockTx.blockNumber) + 1n;
      await delay(250);
    } else {
      break;
    }
  }

  return aggregated;
};

const fetchTxidTransactionsFromGraph = async (
  chain,
  latestGraphID,
  startingBlockNumber,
  maxResults = MAX_QUERY_RESULTS,
) => {
  const network = networkForChain(chain);
  if (!network || !isDefined(network.poi)) {
    return [];
  }

  const graphqlUrl = sourceUrlForNetwork(network.name);
  if (!graphqlUrl) {
    return [];
  }

  const startingId = latestGraphID ?? '0x00';
  const resultsById = await autoPaginateById(graphqlUrl, startingId, maxResults);
  if (resultsById.length > 0) {
    return formatRailgunTransactions(removeDuplicatesByID(resultsById));
  }

  if (!isDefined(startingBlockNumber)) {
    return [];
  }

  const blockResults = await autoPaginateByBlockNumber(
    graphqlUrl,
    startingBlockNumber.toString(),
    maxResults,
  );
  if (blockResults.length === 0) {
    return [];
  }

  return formatRailgunTransactions(removeDuplicatesByID(blockResults));
};

export const quickSyncRailgunTransactionsV2 = async (
  chain,
  latestGraphID,
  startingBlockNumber,
) => {
  const pendingTxidsKey = '__pending_txid_transactions__';
  const pending = globalThis?.[pendingTxidsKey];
  if (Array.isArray(pending) && pending.length > 0) {
    console.log(
      `[QUICKSYNC-TXID] Injecting ${pending.length} on-chain transactions into sync pipeline`,
    );
    return pending;
  }

  const network = networkForChain(chain);
  if (!network || !isDefined(network.poi)) {
    console.log(
      `[QUICKSYNC-TXID] Skipping TXID sync - network: ${network?.name}, hasPOI: ${isDefined(network?.poi)}`,
    );
    return [];
  }

  let fallbackBlockNumber = startingBlockNumber;
  if (!isDefined(fallbackBlockNumber)) {
    try {
      const { getEngine } = await import('../core/engine.js');
      const engine = getEngine();
      if (engine) {
        const latestTxidData = await engine.getLatestRailgunTxidData(
          TXIDVersion.V2_PoseidonMerkle,
          chain,
        );
        if (latestTxidData && latestTxidData.txidIndex >= 0) {
          const txidMerkletree = engine.getTXIDMerkletree(
            TXIDVersion.V2_PoseidonMerkle,
            chain,
          );
          if (txidMerkletree) {
            const latestTx = await txidMerkletree.getRailgunTransaction(
              0,
              latestTxidData.txidIndex,
            );
            if (latestTx?.blockNumber) {
              fallbackBlockNumber = latestTx.blockNumber + 1;
              console.log(
                `[QUICKSYNC-TXID] Auto-detected starting block from local merkletree: ${fallbackBlockNumber}`,
              );
            }
          }
        }
      }
    } catch (error) {
      console.log(
        `[QUICKSYNC-TXID] Could not auto-detect block number: ${error?.message || error}`,
      );
    }
  }

  const graphTransactions = await fetchTxidTransactionsFromGraph(
    chain,
    latestGraphID,
    fallbackBlockNumber,
    MAX_QUERY_RESULTS,
  );

  console.log(
    `[QUICKSYNC-TXID] Total transactions fetched from GraphQL: ${graphTransactions.length}`,
  );
  return graphTransactions;
};

