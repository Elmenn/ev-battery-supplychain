import { ChunkResult, RawBlock, RawLog, RawTransaction } from "../fetcher/types";
import { EvmProcessorLog } from "../evm-log";
import { ProcessedBlock, ProcessedTransaction } from "./block-processor";

export function convertChunkToBlocks(chunk: ChunkResult): ProcessedBlock[] {
  const blockNumbers = new Set<number>();

  chunk.logs.forEach((log) => blockNumbers.add(hexToNumber(log.blockNumber)));
  chunk.transactions.forEach((tx) =>
    blockNumbers.add(hexToNumber(tx.blockNumber))
  );

  const blocks = new Map<number, ProcessedBlock>();

  const sortedNumbers = Array.from(blockNumbers).sort((a, b) => a - b);
  for (const height of sortedNumbers) {
    const rawBlock = chunk.blocks.get(height);
    blocks.set(height, {
      header: createBlockHeader(height, rawBlock),
      logs: [],
      transactions: [],
    });
  }

  for (const log of chunk.logs) {
    const height = hexToNumber(log.blockNumber);
    const block = blocks.get(height);
    if (!block) continue;
    block.logs.push(convertLog(log, chunk.blocks.get(height)));
  }

  for (const tx of chunk.transactions.values()) {
    const height = hexToNumber(tx.blockNumber);
    const block = blocks.get(height);
    if (!block) continue;
    block.transactions.push(convertTransaction(tx, block.header.timestamp));
  }

  return Array.from(blocks.values())
    .map((block) => {
      block.logs.sort((a, b) => a.logIndex - b.logIndex);
      block.transactions.sort(
        (a, b) => a.transactionIndex - b.transactionIndex
      );
      return block;
    })
    .filter((block) => block.logs.length > 0 || block.transactions.length > 0);
}

function createBlockHeader(height: number, rawBlock?: RawBlock) {
  const timestampSeconds = rawBlock ? hexToNumber(rawBlock.timestamp) : 0;
  return {
    height,
    timestamp: timestampSeconds * 1000,
  };
}

function convertLog(log: RawLog, rawBlock?: RawBlock): EvmProcessorLog {
  return {
    id: `${log.blockHash}:${log.logIndex}`,
    transactionIndex: hexToNumber(log.transactionIndex),
    logIndex: hexToNumber(log.logIndex),
    address: log.address,
    data: log.data,
    topics: log.topics,
    block: {
      id: log.blockHash,
      hash: log.blockHash,
      height: hexToNumber(log.blockNumber),
      parentHash: rawBlock?.parentHash ?? "",
      timestamp: rawBlock ? hexToNumber(rawBlock.timestamp) * 1000 : 0,
    },
    transaction: {
      hash: log.transactionHash,
    },
  };
}

function convertTransaction(
  tx: RawTransaction,
  blockTimestamp: number
): ProcessedTransaction {
  return {
    hash: tx.hash,
    to: tx.to,
    input: tx.input,
    transactionIndex: hexToNumber(tx.transactionIndex),
    blockNumber: hexToNumber(tx.blockNumber),
    blockTimestamp,
  };
}

function hexToNumber(value: string): number {
  if (!value) return 0;
  return Number.parseInt(value, 16);
}



