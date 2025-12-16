import { Chain, RailgunTransactionV2 } from '@railgun-community/engine';
import {
  NetworkName,
  delay,
  isDefined,
  networkForChain,
} from '@railgun-community/shared-models';
import { removeDuplicatesByID } from '../../util/graph-util';
import {
  GraphRailgunTransactions,
  formatRailgunTransactions,
} from '../railgun-txid-graph-type-formatters';
import { getTxidGraphSDK } from './txid-graphql-client';

const PAGE_SIZE = 5000;
const MAX_RESULTS_DEFAULT = 5000;

const autoPaginateById = async (
  networkName: NetworkName,
  startingId: string,
  maxResults: number,
): Promise<GraphRailgunTransactions> => {
  const sdk = getTxidGraphSDK(networkName);

  let cursor = startingId;
  let aggregated: GraphRailgunTransactions = [];

  do {
    const response = await sdk.GetRailgunTransactionsAfterGraphID({ idLow: cursor });
    const results = response.transactions;

    if (results.length === 0) {
      break;
    }

    aggregated = aggregated.concat(results);

    if (aggregated.length >= maxResults) {
      break;
    }

    cursor = results[results.length - 1].id;

    if (results.length === PAGE_SIZE) {
      await delay(250);
    } else {
      break;
    }
  } while (true);

  return aggregated;
};

const getGraphQLUrlForTxids = (networkName: NetworkName): string => {
  const envOverrideMap: Partial<Record<NetworkName, Optional<string>>> = {
    [NetworkName.Ethereum]: process?.env?.RAILGUN_ETHEREUM_V2_SUBGRAPH_URL,
    [NetworkName.EthereumSepolia]: process?.env?.RAILGUN_SEPOLIA_V2_SUBGRAPH_URL,
    [NetworkName.BNBChain]: process?.env?.RAILGUN_BSC_V2_SUBGRAPH_URL,
    [NetworkName.Polygon]: process?.env?.RAILGUN_POLYGON_V2_SUBGRAPH_URL,
    [NetworkName.Arbitrum]: process?.env?.RAILGUN_ARBITRUM_V2_SUBGRAPH_URL,
  };

  const override = envOverrideMap[networkName];
  if (override && override.length > 0) {
    return override;
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
      throw new Error(`No GraphQL URL configured for network ${networkName}`);
  }
};

const fetchTransactionsByBlockNumber = async (
  graphqlUrl: string,
  blockNumber: string,
): Promise<GraphRailgunTransactions> => {
  const query = {
    query: `
      query GetRailgunTransactionsByBlockNumber($blockNumber: BigInt!) {
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
    `,
    variables: { blockNumber },
  };

  const response = await fetch(graphqlUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return (data.data?.transactions ?? []) as GraphRailgunTransactions;
};

const autoPaginateByBlockNumber = async (
  networkName: NetworkName,
  startingBlock: string,
  maxResults: number,
): Promise<GraphRailgunTransactions> => {
  const graphqlUrl = getGraphQLUrlForTxids(networkName);

  let cursor = BigInt(startingBlock);
  let aggregated: GraphRailgunTransactions = [];

  do {
    const results = await fetchTransactionsByBlockNumber(
      graphqlUrl,
      cursor.toString(),
    );

    if (results.length === 0) {
      break;
    }

    aggregated = aggregated.concat(results);

    if (aggregated.length >= maxResults) {
      break;
    }

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
  } while (true);

  return aggregated;
};

export const fetchTxidTransactionsFromGraph = async (
  chain: Chain,
  latestGraphID: Optional<string>,
  startingBlockNumber?: Optional<number>,
  maxResults: number = MAX_RESULTS_DEFAULT,
): Promise<RailgunTransactionV2[]> => {
  const network = networkForChain(chain);
  if (!network) {
    return [];
  }

  const hasPOIConfig = isDefined(network.poi);
  if (!hasPOIConfig) {
    return [];
  }

  const startingId = latestGraphID ?? '0x00';
  const resultsById = await autoPaginateById(network.name, startingId, maxResults);

  if (resultsById.length > 0) {
    console.log(
      `[QUICKSYNC-TXID][DEBUG] Graph results by ID: count=${resultsById.length}, sample boundParamsHash=${resultsById[0]?.boundParamsHash}, commitments=${resultsById[0]?.commitments?.length}`,
    );
    const deduped = removeDuplicatesByID(resultsById);
    const formatted = formatRailgunTransactions(deduped);
    console.log(
      `[QUICKSYNC-TXID][DEBUG] Formatted txs by ID: count=${formatted.length}, sample txid=${formatted[0]?.txid}, commitments=${formatted[0]?.commitments?.length}, nullifiers=${formatted[0]?.nullifiers?.length}`,
    );
    return formatted;
  }

  if (!isDefined(startingBlockNumber)) {
    return [];
  }

  const blockResults = await autoPaginateByBlockNumber(
    network.name,
    startingBlockNumber.toString(),
    maxResults,
  );
  console.log(
    `[QUICKSYNC-TXID][DEBUG] Graph results by block: count=${blockResults.length}, sample boundParamsHash=${blockResults[0]?.boundParamsHash}, commitments=${blockResults[0]?.commitments?.length}`,
  );

  if (blockResults.length === 0) {
    return [];
  }

  const dedupedBlockResults = removeDuplicatesByID(blockResults);
  const formattedBlock = formatRailgunTransactions(dedupedBlockResults);
  console.log(
    `[QUICKSYNC-TXID][DEBUG] Formatted txs by block: count=${formattedBlock.length}, sample txid=${formattedBlock[0]?.txid}, commitments=${formattedBlock[0]?.commitments?.length}, nullifiers=${formattedBlock[0]?.nullifiers?.length}`,
  );
  return formattedBlock;
};


