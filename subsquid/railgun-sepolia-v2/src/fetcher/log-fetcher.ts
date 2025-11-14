import { performance } from "node:perf_hooks";
import { RetryConfig } from "../config";
import {
  JsonRpcClient,
  JsonRpcError,
  JsonRpcResponse,
} from "../rpc/json-rpc";
import {
  BlockRange,
  ChunkResult,
  RawBlock,
  RawLog,
  RawTransaction,
} from "./types";

export type ChunkFetchOutcome =
  | { ok: true; durationMs: number; result: ChunkResult }
  | {
      ok: false;
      durationMs: number;
      error: Error;
      isRetryable: boolean;
      isRateLimited: boolean;
    };

const HEX_PREFIX = "0x";

function numberToHex(value: number): string {
  return HEX_PREFIX + value.toString(16);
}

function dedupe<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function categorizeError(error: unknown): {
  isRetryable: boolean;
  isRateLimited: boolean;
} {
  if (error instanceof JsonRpcError) {
    if (error.code === -32005 || error.code === -32016) {
      return { isRateLimited: true, isRetryable: true };
    }
    if (error.code === -32000 || error.code === -32603) {
      return { isRateLimited: false, isRetryable: true };
    }
    return { isRateLimited: false, isRetryable: false };
  }

  if (
    typeof error === "object" &&
    error != null &&
    (error as any).isAxiosError === true
  ) {
    const status = (error as any).response?.status;
    if (status === 429) {
      return { isRateLimited: true, isRetryable: true };
    }
    if (status == null || status >= 500) {
      return { isRateLimited: false, isRetryable: true };
    }
  }

  return { isRateLimited: false, isRetryable: false };
}

async function executeWithRetries<T>(
  fn: () => Promise<T>,
  retry: RetryConfig
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retry.maxRetries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const { isRetryable } = categorizeError(err);
      if (!isRetryable || attempt === retry.maxRetries) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, retry.retryDelayMs * Math.max(1, attempt + 1))
      );
      attempt += 1;
    }
  }
  throw lastError;
}

export async function fetchChunk(
  client: JsonRpcClient,
  range: BlockRange,
  topics: string[],
  address: string,
  retry: RetryConfig
): Promise<ChunkFetchOutcome> {
  const start = performance.now();

  try {
    const logs = await executeWithRetries<RawLog[]>(async () => {
      return client.call<RawLog[]>("eth_getLogs", [
        {
          fromBlock: numberToHex(range.fromBlock),
          toBlock: numberToHex(range.toBlock),
          address,
          topics: [topics],
        },
      ]);
    }, retry);

    const blockNumbers = dedupe(
      logs.map((log) => Number.parseInt(log.blockNumber, 16))
    );
    const txHashes = dedupe(logs.map((log) => log.transactionHash));

    const [blocks, transactions] = await Promise.all([
      batchFetchBlocks(client, blockNumbers, retry),
      batchFetchTransactions(client, txHashes, retry),
    ]);

    const durationMs = performance.now() - start;
    return {
      ok: true,
      durationMs,
      result: {
        range,
        logs,
        blocks,
        transactions,
      },
    };
  } catch (error) {
    const durationMs = performance.now() - start;
    const categorization = categorizeError(error);
    return {
      ok: false,
      durationMs,
      error: error instanceof Error ? error : new Error(String(error)),
      isRetryable: categorization.isRetryable,
      isRateLimited: categorization.isRateLimited,
    };
  }
}

async function batchFetchBlocks(
  client: JsonRpcClient,
  blockNumbers: number[],
  retry: RetryConfig
): Promise<Map<number, RawBlock>> {
  const blocks = new Map<number, RawBlock>();
  const batches = chunkArray(blockNumbers, 50);
  for (const batch of batches) {
    const requests = batch.map((blockNumber) => ({
      method: "eth_getBlockByNumber",
      params: [numberToHex(blockNumber), false],
    }));

    const responses = await executeWithRetries<
      JsonRpcResponse<RawBlock>[]
    >(async () => {
      return client.batch<RawBlock>(requests);
    }, retry);

    responses.forEach((res, index) => {
      if (res.error) {
        throw JsonRpcError.fromResponse(res);
      }
      const blockNumber = batch[index];
      if (res.result) {
        blocks.set(blockNumber, res.result);
      }
    });
  }
  return blocks;
}

async function batchFetchTransactions(
  client: JsonRpcClient,
  txHashes: string[],
  retry: RetryConfig
): Promise<Map<string, RawTransaction>> {
  const transactions = new Map<string, RawTransaction>();
  const batches = chunkArray(txHashes, 50);

  for (const batch of batches) {
    const requests = batch.map((hash) => ({
      method: "eth_getTransactionByHash",
      params: [hash],
    }));

    const responses = await executeWithRetries<
      JsonRpcResponse<RawTransaction>[]
    >(async () => {
      return client.batch<RawTransaction>(requests);
    }, retry);

    responses.forEach((res, index) => {
      if (res.error) {
        throw JsonRpcError.fromResponse(res);
      }
      const hash = batch[index];
      if (res.result) {
        transactions.set(hash, res.result);
      }
    });
  }

  return transactions;
}

