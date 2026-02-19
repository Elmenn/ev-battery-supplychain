import {
  TXIDVersion,
  ByteLength,
  ByteUtils,
  CommitmentType,
  TokenType,
  serializePreImage,
  serializeTokenData,
} from '@railgun-community/engine';
import { NetworkName, networkForChain } from '@railgun-community/shared-models';
import { getAddress } from 'ethers';

const EMPTY_EVENTS = {
  commitmentEvents: [],
  nullifierEvents: [],
  unshieldEvents: [],
};

const PAGE_SIZE = 10000;
const MAX_QUERY_RESULTS = 100000;

const NULLIFIERS_QUERY = `
  query Nullifiers($blockNumber: BigInt = 0) {
    nullifiers(
      orderBy: [blockNumber_ASC, nullifier_DESC]
      where: { blockNumber_gte: $blockNumber }
      limit: 10000
    ) {
      id
      blockNumber
      nullifier
      transactionHash
      blockTimestamp
      treeNumber
    }
  }
`;

const UNSHIELDS_QUERY = `
  query Unshields($blockNumber: BigInt = 0) {
    unshields(
      orderBy: [blockNumber_ASC, eventLogIndex_ASC]
      where: { blockNumber_gte: $blockNumber }
      limit: 10000
    ) {
      id
      blockNumber
      to
      transactionHash
      fee
      blockTimestamp
      amount
      eventLogIndex
      token {
        tokenType
        tokenSubID
        tokenAddress
      }
    }
  }
`;

const COMMITMENTS_QUERY = `
  query Commitments($blockNumber: BigInt = 0) {
    commitments(
      orderBy: [blockNumber_ASC, treePosition_ASC]
      where: { blockNumber_gte: $blockNumber }
      limit: 10000
    ) {
      id
      treeNumber
      batchStartTreePosition
      treePosition
      blockNumber
      transactionHash
      blockTimestamp
      commitmentType
      hash
      ... on LegacyGeneratedCommitment {
        encryptedRandom
        preimage {
          npk
          value
          token {
            tokenType
            tokenSubID
            tokenAddress
          }
        }
      }
      ... on LegacyEncryptedCommitment {
        legacyCiphertext: ciphertext {
          ciphertext {
            iv
            tag
            data
          }
          ephemeralKeys
          memo
        }
      }
      ... on ShieldCommitment {
        shieldKey
        fee
        encryptedBundle
        preimage {
          npk
          value
          token {
            tokenType
            tokenSubID
            tokenAddress
          }
        }
      }
      ... on TransactCommitment {
        ciphertext {
          ciphertext {
            iv
            tag
            data
          }
          blindedSenderViewingKey
          blindedReceiverViewingKey
          annotationData
          memo
        }
      }
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const removeDuplicatesByID = (items) => {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const autoPaginatingQuery = async (queryFn, blockNumber) => {
  let cursor = String(blockNumber);
  let results = [];
  while (true) {
    const page = await queryFn(cursor);
    if (!page.length) break;
    results = results.concat(page);
    if (results.length >= MAX_QUERY_RESULTS) break;
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1].blockNumber;
    await sleep(250);
  }
  return results;
};

const formatTo16Bytes = (value, prefix) =>
  ByteUtils.formatToByteLength(value, ByteLength.UINT_128, prefix);
const formatTo32Bytes = (value, prefix) =>
  ByteUtils.formatToByteLength(value, ByteLength.UINT_256, prefix);
const bigIntStringToHex = (bigintString) => `0x${BigInt(bigintString).toString(16)}`;

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

const formatSerializedToken = (graphToken) =>
  serializeTokenData(
    graphToken.tokenAddress,
    graphTokenTypeToEngineTokenType(graphToken.tokenType),
    graphToken.tokenSubID,
  );

const formatPreImage = (graphPreImage) =>
  serializePreImage(
    graphPreImage.npk,
    formatSerializedToken(graphPreImage.token),
    BigInt(graphPreImage.value),
  );

const formatCiphertext = (graphCiphertext) => ({
  iv: formatTo16Bytes(graphCiphertext.iv, false),
  tag: formatTo16Bytes(graphCiphertext.tag, false),
  data: graphCiphertext.data.map(d => formatTo32Bytes(d, false)),
});

const formatLegacyCommitmentCiphertext = (graphLegacyCommitmentCiphertext) => ({
  ciphertext: formatCiphertext(graphLegacyCommitmentCiphertext.ciphertext),
  ephemeralKeys: graphLegacyCommitmentCiphertext.ephemeralKeys.map(ephemeralKey =>
    formatTo32Bytes(ephemeralKey, false),
  ),
  memo: graphLegacyCommitmentCiphertext.memo.map(m => formatTo32Bytes(m, false)),
});

const formatCommitmentCiphertext = (graphCommitmentCiphertext) => ({
  ciphertext: formatCiphertext(graphCommitmentCiphertext.ciphertext),
  blindedReceiverViewingKey: formatTo32Bytes(
    graphCommitmentCiphertext.blindedReceiverViewingKey,
    false,
  ),
  blindedSenderViewingKey: formatTo32Bytes(
    graphCommitmentCiphertext.blindedSenderViewingKey,
    false,
  ),
  memo: graphCommitmentCiphertext.memo,
  annotationData: graphCommitmentCiphertext.annotationData,
});

const formatCommitment = (commitment) => {
  switch (commitment.commitmentType) {
    case 'LegacyGeneratedCommitment':
      return {
        txid: formatTo32Bytes(commitment.transactionHash, false),
        timestamp: Number(commitment.blockTimestamp),
        commitmentType: CommitmentType.LegacyGeneratedCommitment,
        hash: formatTo32Bytes(bigIntStringToHex(commitment.hash), false),
        preImage: formatPreImage(commitment.preimage),
        encryptedRandom: [
          formatTo32Bytes(commitment.encryptedRandom[0], false),
          formatTo16Bytes(commitment.encryptedRandom[1], false),
        ],
        blockNumber: Number(commitment.blockNumber),
        utxoTree: commitment.treeNumber,
        utxoIndex: commitment.treePosition,
      };
    case 'LegacyEncryptedCommitment':
      return {
        txid: formatTo32Bytes(commitment.transactionHash, false),
        timestamp: Number(commitment.blockTimestamp),
        commitmentType: CommitmentType.LegacyEncryptedCommitment,
        hash: formatTo32Bytes(bigIntStringToHex(commitment.hash), false),
        ciphertext: formatLegacyCommitmentCiphertext(commitment.legacyCiphertext),
        blockNumber: Number(commitment.blockNumber),
        utxoTree: commitment.treeNumber,
        utxoIndex: commitment.treePosition,
        railgunTxid: undefined,
      };
    case 'ShieldCommitment': {
      const shieldCommitment = {
        txid: formatTo32Bytes(commitment.transactionHash, false),
        timestamp: Number(commitment.blockTimestamp),
        commitmentType: CommitmentType.ShieldCommitment,
        hash: formatTo32Bytes(bigIntStringToHex(commitment.hash), false),
        preImage: formatPreImage(commitment.preimage),
        blockNumber: Number(commitment.blockNumber),
        encryptedBundle: commitment.encryptedBundle,
        shieldKey: commitment.shieldKey,
        fee: commitment.fee ? commitment.fee.toString() : undefined,
        utxoTree: commitment.treeNumber,
        utxoIndex: commitment.treePosition,
        from: undefined,
      };
      if (!shieldCommitment.fee) {
        delete shieldCommitment.fee;
      }
      return shieldCommitment;
    }
    case 'TransactCommitment':
      return {
        txid: formatTo32Bytes(commitment.transactionHash, false),
        timestamp: Number(commitment.blockTimestamp),
        commitmentType: CommitmentType.TransactCommitmentV2,
        hash: formatTo32Bytes(bigIntStringToHex(commitment.hash), false),
        ciphertext: formatCommitmentCiphertext(commitment.ciphertext),
        blockNumber: Number(commitment.blockNumber),
        utxoTree: commitment.treeNumber,
        utxoIndex: commitment.treePosition,
        railgunTxid: undefined,
      };
    default:
      return null;
  }
};

const createGraphCommitmentBatches = (flattenedCommitments) => {
  const map = {};
  for (const commitment of flattenedCommitments) {
    const startPosition = commitment.batchStartTreePosition;
    const key = `${commitment.treeNumber}:${startPosition}`;
    if (!map[key]) {
      map[key] = {
        commitments: [],
        transactionHash: commitment.transactionHash,
        treeNumber: commitment.treeNumber,
        startPosition,
        blockNumber: Number(commitment.blockNumber),
      };
    }
    map[key].commitments.push(commitment);
  }
  return Object.values(map);
};

const sortByTreeNumberAndStartPosition = (a, b) => {
  if (a.treeNumber < b.treeNumber) return -1;
  if (a.treeNumber > b.treeNumber) return 1;
  if (a.startPosition < b.startPosition) return -1;
  if (a.startPosition > b.startPosition) return 1;
  return 0;
};

const quickSyncEventsGraphV2 = async (chain, startingBlock) => {
  const network = networkForChain(chain);
  const endpoint = network ? sourceUrlForNetwork(network.name) : null;
  if (!network || !endpoint) {
    return EMPTY_EVENTS;
  }

  const nullifiers = await autoPaginatingQuery(
    async (blockNumber) => {
      const data = await graphRequest(endpoint, NULLIFIERS_QUERY, { blockNumber });
      return data.nullifiers ?? [];
    },
    startingBlock,
  );

  await sleep(100);

  const unshields = await autoPaginatingQuery(
    async (blockNumber) => {
      const data = await graphRequest(endpoint, UNSHIELDS_QUERY, { blockNumber });
      return data.unshields ?? [];
    },
    startingBlock,
  );

  await sleep(100);

  const commitments = await autoPaginatingQuery(
    async (blockNumber) => {
      const data = await graphRequest(endpoint, COMMITMENTS_QUERY, { blockNumber });
      return data.commitments ?? [];
    },
    startingBlock,
  );

  const filteredNullifiers = removeDuplicatesByID(nullifiers);
  const filteredUnshields = removeDuplicatesByID(unshields);
  const filteredCommitments = removeDuplicatesByID(commitments);

  const graphCommitmentBatches = createGraphCommitmentBatches(filteredCommitments);
  graphCommitmentBatches.sort(sortByTreeNumberAndStartPosition);

  const nullifierEvents = filteredNullifiers.map(nullifier => ({
    txid: formatTo32Bytes(nullifier.transactionHash, false),
    nullifier: formatTo32Bytes(nullifier.nullifier, false),
    treeNumber: nullifier.treeNumber,
    blockNumber: Number(nullifier.blockNumber),
    spentRailgunTxid: undefined,
  }));

  const unshieldEvents = filteredUnshields.map(unshield => ({
    txid: formatTo32Bytes(unshield.transactionHash, false),
    timestamp: Number(unshield.blockTimestamp),
    eventLogIndex: Number(unshield.eventLogIndex),
    toAddress: getAddress(unshield.to),
    tokenType: graphTokenTypeToEngineTokenType(unshield.token.tokenType),
    tokenAddress: getAddress(unshield.token.tokenAddress),
    tokenSubID: unshield.token.tokenSubID,
    amount: bigIntStringToHex(unshield.amount),
    fee: bigIntStringToHex(unshield.fee),
    blockNumber: Number(unshield.blockNumber),
    railgunTxid: undefined,
    poisPerList: undefined,
    blindedCommitment: undefined,
  }));

  const commitmentEvents = graphCommitmentBatches.map(batch => ({
    txid: formatTo32Bytes(batch.transactionHash || `0x${'00'.repeat(32)}`, false),
    commitments: batch.commitments.map(formatCommitment).filter(Boolean),
    treeNumber: batch.treeNumber,
    startPosition: batch.startPosition,
    blockNumber: batch.blockNumber ?? 0,
  }));

  return { nullifierEvents, unshieldEvents, commitmentEvents };
};

export const quickSyncEventsGraph = async (txidVersion, chain, startingBlock) => {
  if (txidVersion !== TXIDVersion.V2_PoseidonMerkle) {
    return EMPTY_EVENTS;
  }
  try {
    return await quickSyncEventsGraphV2(chain, startingBlock);
  } catch (error) {
    console.warn('[QUICKSYNC-UTXO] V2 quick-sync failed, returning empty events:', error?.message || error);
    return EMPTY_EVENTS;
  }
};

