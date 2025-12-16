import {
  Nullifier,
  UnshieldStoredEvent,
  CommitmentEvent,
  Commitment,
  LegacyGeneratedCommitment,
  CommitmentType,
  LegacyEncryptedCommitment,
  ShieldCommitment,
  TransactCommitmentV2,
  CommitmentCiphertextV2,
  Ciphertext,
  LegacyCommitmentCiphertext,
} from '@railgun-community/engine';
import {
  Nullifier as GraphNullifierV2,
  Unshield as GraphUnshieldV2,
  LegacyGeneratedCommitment as GraphLegacyGeneratedCommitmentV2,
  LegacyEncryptedCommitment as GraphLegacyEncryptedCommitmentV2,
  ShieldCommitment as GraphShieldCommitmentV2,
  TransactCommitment as GraphTransactCommitmentV2,
  LegacyCommitmentCiphertext as GraphLegacyCommitmentCiphertextV2,
  CommitmentCiphertext as GraphCommitmentCiphertextV2,
  Ciphertext as GraphCiphertextV2,
} from './graphql';
import { getAddress } from 'ethers';
import { isDefined } from '@railgun-community/shared-models';
import {
  formatTo32Bytes,
  bigIntStringToHex,
  formatTo16Bytes,
  formatPreImage,
  graphTokenTypeToEngineTokenType,
} from '../shared-formatters';

export type GraphCommitmentV2 =
  | GraphLegacyEncryptedCommitmentV2
  | GraphLegacyGeneratedCommitmentV2
  | GraphShieldCommitmentV2
  | GraphTransactCommitmentV2;

export type GraphCommitmentBatchV2 = {
  treeNumber: number;
  startPosition: number; // Working repo uses startPosition (mapped from batchStartTreePosition)
  commitments: GraphCommitmentV2[];
  transactionHash?: string;
  blockNumber?: number;
  blockTimestamp?: number;
};

export const formatGraphNullifierEventsV2 = (
  nullifiers: GraphNullifierV2[],
): Nullifier[] => {
  return nullifiers.map(nullifier => {
    return {
      txid: formatTo32Bytes(nullifier.transactionHash, false),
      nullifier: formatTo32Bytes(nullifier.nullifier, false),
      treeNumber: nullifier.treeNumber,
      blockNumber: Number(nullifier.blockNumber),
      spentRailgunTxid: undefined,
    };
  });
};

export const formatGraphUnshieldEventsV2 = (
  unshields: GraphUnshieldV2[],
): UnshieldStoredEvent[] => {
  return unshields.map(unshield => {
    return {
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
    };
  });
};

export const formatGraphCommitmentEventsV2 = (
  graphCommitmentBatches: GraphCommitmentBatchV2[],
): CommitmentEvent[] => {
  const events = graphCommitmentBatches.map(graphCommitmentBatch => {
    const txHash = graphCommitmentBatch.transactionHash || '0x' + '00'.repeat(32);
    return {
      txid: formatTo32Bytes(txHash, false),
      commitments: graphCommitmentBatch.commitments.map(formatCommitment),
      treeNumber: graphCommitmentBatch.treeNumber,
      startPosition: graphCommitmentBatch.startPosition, // ✅ Already mapped in batch object
      blockNumber: graphCommitmentBatch.blockNumber ?? 0,
    };
  });
  
  // Sanity checks
  const seen = new Set<string>();
  let totalCommitments = 0;
  for (const ev of events) {
    const key = `${ev.treeNumber}:${ev.startPosition}`;
    if (seen.has(key)) {
      console.error(`[FORMAT-ERROR] ⚠️  DUPLICATE BATCH: ${key}`);
    }
    seen.add(key);
    totalCommitments += ev.commitments.length;
  }
  
  console.log(`[FORMAT] events=${events.length}, sumCommitments=${totalCommitments}`);
  
  return events;
};

const formatCommitment = (commitment: GraphCommitmentV2): Commitment => {
  switch (commitment.commitmentType) {
    case 'LegacyGeneratedCommitment':
      return formatLegacyGeneratedCommitment(
        commitment as GraphLegacyGeneratedCommitmentV2,
      );
    case 'LegacyEncryptedCommitment':
      return formatLegacyEncryptedCommitment(
        commitment as GraphLegacyEncryptedCommitmentV2,
      );
    case 'ShieldCommitment':
      return formatShieldCommitment(commitment as GraphShieldCommitmentV2);
    case 'TransactCommitment':
      return formatTransactCommitment(commitment as GraphTransactCommitmentV2);
  }
};

const formatCiphertext = (graphCiphertext: GraphCiphertextV2): Ciphertext => {
  return {
    iv: formatTo16Bytes(graphCiphertext.iv, false),
    tag: formatTo16Bytes(graphCiphertext.tag, false),
    data: graphCiphertext.data.map(d => formatTo32Bytes(d, false)),
  };
};

const formatLegacyCommitmentCiphertext = (
  graphLegacyCommitmentCiphertext: GraphLegacyCommitmentCiphertextV2,
): LegacyCommitmentCiphertext => {
  return {
    ciphertext: formatCiphertext(graphLegacyCommitmentCiphertext.ciphertext),
    ephemeralKeys: graphLegacyCommitmentCiphertext.ephemeralKeys.map(
      ephemeralKey => formatTo32Bytes(ephemeralKey, false),
    ),
    memo: graphLegacyCommitmentCiphertext.memo.map(m =>
      formatTo32Bytes(m, false),
    ),
  };
};

const formatCommitmentCiphertext = (
  graphCommitmentCiphertext: GraphCommitmentCiphertextV2,
): CommitmentCiphertextV2 => {
  return {
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
  };
};

const formatLegacyGeneratedCommitment = (
  commitment: GraphLegacyGeneratedCommitmentV2,
): LegacyGeneratedCommitment => {
  return {
    txid: formatTo32Bytes(commitment.transactionHash, false),
    timestamp: Number(commitment.blockTimestamp),
    commitmentType: CommitmentType.LegacyGeneratedCommitment,
    hash: formatTo32Bytes(bigIntStringToHex(commitment.hash), false),
    preImage: formatPreImage(commitment.preimage),
    encryptedRandom: [
      formatTo32Bytes(commitment.encryptedRandom[0], false),
      formatTo16Bytes(commitment.encryptedRandom[1], false),
    ] as [string, string],
    blockNumber: Number(commitment.blockNumber),
    utxoTree: commitment.treeNumber,
    utxoIndex: commitment.treePosition,
  };
};

const formatLegacyEncryptedCommitment = (
  commitment: GraphLegacyEncryptedCommitmentV2,
): LegacyEncryptedCommitment => {
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
};

const formatShieldCommitment = (
  commitment: GraphShieldCommitmentV2,
): ShieldCommitment => {
  const shieldCommitment: ShieldCommitment = {
    txid: formatTo32Bytes(commitment.transactionHash, false),
    timestamp: Number(commitment.blockTimestamp),
    commitmentType: CommitmentType.ShieldCommitment,
    hash: formatTo32Bytes(bigIntStringToHex(commitment.hash), false),
    preImage: formatPreImage(commitment.preimage),
    blockNumber: Number(commitment.blockNumber),
    encryptedBundle: commitment.encryptedBundle as [string, string, string],
    shieldKey: commitment.shieldKey,
    fee: isDefined(commitment.fee) ? commitment.fee.toString() : undefined,
    utxoTree: commitment.treeNumber,
    utxoIndex: commitment.treePosition,
    from: undefined,
  };
  if (!isDefined(shieldCommitment.fee)) {
    delete shieldCommitment.fee;
  }
  return shieldCommitment;
};

const formatTransactCommitment = (
  commitment: GraphTransactCommitmentV2,
): TransactCommitmentV2 => {
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
};
