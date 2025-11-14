import {
  Ciphertext,
  CommitmentCiphertext,
  CommitmentPreimage,
  LegacyCommitmentCiphertext,
  LegacyEncryptedCommitment,
  LegacyGeneratedCommitment,
  Nullifier,
  ShieldCommitment,
  Token,
  TransactCommitment,
  Transaction as ModelTransaction,
  Unshield,
  VerificationHash,
} from "../model";
import { EvmProcessorLog } from "../evm-log";
import {
  handleCommitmentBatch,
  handleGeneratedCommitmentBatch,
  handleNullifier,
  handleShield,
  handleTransact,
  handleUnshield,
} from "../railgun-smart-wallet-events";
import {
  processLegacyTransactionInput,
  processTransactionInput,
} from "../railgun-smart-wallet-call";
import { PersistableBatch } from "../db/bulk-writer";
import { ProcessingContext } from "./context";
import {
  functions as railgunFunctions,
  events as railgunEvents,
} from "../abi/RailgunSmartWallet";

export type ProcessedTransaction = {
  hash: string;
  to: string | null;
  input: string;
  transactionIndex: number;
  blockNumber: number;
  blockTimestamp: number;
};

export type ProcessedBlock = {
  header: {
    height: number;
    timestamp: number;
  };
  logs: EvmProcessorLog[];
  transactions: ProcessedTransaction[];
};

export interface BlockProcessingResult {
  batch: PersistableBatch;
  verificationHash?: VerificationHash;
}

export async function processBlocks(
  context: ProcessingContext,
  blocks: ProcessedBlock[],
  contractAddress: string
): Promise<BlockProcessingResult> {
  const lowerCaseContract = contractAddress.toLowerCase();
  const transactSighash = railgunFunctions[
    "transact((((uint256,uint256),(uint256[2],uint256[2]),(uint256,uint256)),bytes32,bytes32[],bytes32[],(uint16,uint72,uint8,uint64,address,bytes32,(bytes32[4],bytes32,bytes32,bytes,bytes)[]),(bytes32,(uint8,address,uint256),uint120))[])"
  ].sighash.toLowerCase();
  const legacyTransactSighash = railgunFunctions[
    "transact((((uint256,uint256),(uint256[2],uint256[2]),(uint256,uint256)),uint256,uint256[],uint256[],(uint16,uint8,address,bytes32,(uint256[4],uint256[2],uint256[])[]),(uint256,(uint8,address,uint256),uint120),address)[])"
  ].sighash.toLowerCase();

  const Nullifiers: Nullifier[] = [];
  const CipherTexts: Ciphertext[] = [];
  const LegacyCommitmentCiphertexts: LegacyCommitmentCiphertext[] = [];
  const LegacyEncrpytedCommitments: LegacyEncryptedCommitment[] = [];
  const TransactCommitments: TransactCommitment[] = [];
  const CommitmentCiphertexts: CommitmentCiphertext[] = [];
  const Unshields: Unshield[] = [];
  const Tokens = new Map<string, Token>();
  const ShieldCommitments: ShieldCommitment[] = [];
  const CommitmentPreimages: CommitmentPreimage[] = [];
  const LegacyGeneratedCommitments: LegacyGeneratedCommitment[] = [];
  const Transactions: ModelTransaction[] = [];

  for (const block of blocks) {
    context.blocks.length = 0;
    context.blocks.push(block);

    for (const evt of block.logs) {
      if (evt.address.toLowerCase() !== lowerCaseContract) continue;

      switch (evt.topics[0]) {
        case railgunEvents.Nullified.topic:
        case railgunEvents.Nullifiers.topic: {
          Nullifiers.push(...handleNullifier(evt));
          break;
        }
        case railgunEvents.CommitmentBatch.topic: {
          const { ciphertexts, lcc, lec } = await handleCommitmentBatch(evt, context);
          CipherTexts.push(...ciphertexts);
          LegacyCommitmentCiphertexts.push(...lcc);
          LegacyEncrpytedCommitments.push(...lec);
          break;
        }
        case railgunEvents.GeneratedCommitmentBatch.topic: {
          const { tokens, legacyGeneratedCommitments, commitmentPreImages } =
            await handleGeneratedCommitmentBatch(evt, context);
          tokens.forEach((value, key) => Tokens.set(key, value));
          LegacyGeneratedCommitments.push(...legacyGeneratedCommitments);
          CommitmentPreimages.push(...commitmentPreImages);
          break;
        }
        case railgunEvents.Transact.topic: {
          const { ciphertexts, transactCommitments, commitmentCiphertexts } =
            await handleTransact(evt, context);
          CipherTexts.push(...ciphertexts);
          TransactCommitments.push(...transactCommitments);
          CommitmentCiphertexts.push(...commitmentCiphertexts);
          break;
        }
        case railgunEvents.Unshield.topic: {
          const { unshield, token } = handleUnshield(evt);
          Unshields.push(unshield);
          Tokens.set(token.id, token);
          break;
        }
        default: {
          if (shieldTopics.includes(evt.topics[0])) {
            const { tokens, shieldCommitments, commitmentPreimages } =
              await handleShield(evt, context);
            ShieldCommitments.push(...shieldCommitments);
            CommitmentPreimages.push(...commitmentPreimages);
            tokens.forEach((value, key) => Tokens.set(key, value));
          }
          break;
        }
      }
    }

    for (const tx of block.transactions) {
      if (!tx.to || tx.to.toLowerCase() !== lowerCaseContract) continue;
      if (tx.input === "0x") continue;

      const sighash = tx.input.slice(0, 10).toLowerCase();
      if (sighash === transactSighash) {
        const { tokens, transactions } = await processTransactionInput(
          {
            input: tx.input,
            blockNumber: tx.blockNumber,
            blockTimestamp: tx.blockTimestamp,
            transactionIndex: tx.transactionIndex,
            transactionHash: tx.hash,
          },
          context
        );
        tokens.forEach((value, key) => Tokens.set(key, value));
        Transactions.push(...transactions);
      } else if (sighash === legacyTransactSighash) {
        const { tokens, transactions } = await processLegacyTransactionInput(
          {
            input: tx.input,
            blockNumber: tx.blockNumber,
            blockTimestamp: tx.blockTimestamp,
            transactionIndex: tx.transactionIndex,
            transactionHash: tx.hash,
          },
          context
        );
        tokens.forEach((value, key) => Tokens.set(key, value));
        Transactions.push(...transactions);
      }
    }
  }

  await context.store.upsert(Nullifiers);
  await context.store.upsert(CipherTexts);
  await context.store.upsert(LegacyCommitmentCiphertexts);
  await context.store.upsert([...Tokens.values()]);
  await context.store.upsert(LegacyEncrpytedCommitments);
  await context.store.upsert(CommitmentCiphertexts);
  await context.store.upsert(Unshields);
  await context.store.upsert(CommitmentPreimages);
  await context.store.upsert(Transactions);
  await context.store.upsert(TransactCommitments);
  await context.store.upsert(ShieldCommitments);
  await context.store.upsert(LegacyGeneratedCommitments);

  const batch = context.store.extractPersistableBatch();
  const verificationHash = context.store.getVerificationHash();
  context.store.clearDirty();

  return { batch, verificationHash };
}

const shieldTopics = [
  railgunEvents[
    "Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[])"
  ].topic,
  railgunEvents[
    "Shield(uint256,uint256,(bytes32,(uint8,address,uint256),uint120)[],(bytes32[3],bytes32)[],uint256[])"
  ].topic,
];


