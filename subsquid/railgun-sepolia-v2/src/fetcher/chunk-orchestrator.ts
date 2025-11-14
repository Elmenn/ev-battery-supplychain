import { PipelineConfig, RetryConfig } from "../config";
import { ProviderPool, ProviderStatus } from "./provider-pool";
import { ChunkScheduler } from "./chunk-scheduler";
import { ChunkFetchOutcome, fetchChunk } from "./log-fetcher";
import { BlockRange, ChunkResult } from "./types";

type ResultHandler = (chunk: ChunkResult, provider: ProviderStatus) => Promise<void>;

export class ChunkOrchestrator {
  private readonly providerPool: ProviderPool;
  private readonly scheduler: ChunkScheduler;
  private readonly topics: string[];
  private readonly address: string;
  private readonly retry: RetryConfig;
  private readonly concurrency: number;
  private readonly startBlock: number;
  private readonly targetBlock: number;

  private pendingRanges: BlockRange[] = [];
  private nextBlock: number;
  private lock: Promise<void> = Promise.resolve();
  private cancelled = false;

  constructor(config: PipelineConfig, pool: ProviderPool, scheduler: ChunkScheduler) {
    this.providerPool = pool;
    this.scheduler = scheduler;
    this.topics = config.topics;
    this.address = config.contractAddress;
    this.retry = config.retry;
    this.concurrency = config.concurrency;
    this.startBlock = config.startBlock;
    this.targetBlock =
      config.targetBlock ?? Number.MAX_SAFE_INTEGER;
    this.nextBlock = this.startBlock;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async run(onChunk: ResultHandler): Promise<void> {
    const workers = Array.from({ length: this.concurrency }, () =>
      this.workerLoop(onChunk)
    );
    await Promise.all(workers);
  }

  private async workerLoop(onChunk: ResultHandler): Promise<void> {
    const idleDelay = Math.max(500, this.retry.retryDelayMs);
    for (;;) {
      if (this.cancelled) {
        return;
      }

      const provider = await this.acquireProvider();
      if (provider == null) {
        return;
      }
      const providerLabel = provider.config.label ?? provider.config.url;

      let latestBlock = Number.MAX_SAFE_INTEGER;
      try {
        const latestHex = await provider.client.call<string>("eth_blockNumber");
        latestBlock = Number.parseInt(latestHex, 16);
      } catch (error) {
        this.providerPool.reportFailure(provider);
        console.warn(
          `[chunk] provider=${providerLabel} failed to fetch latest block: ${(error as Error).message}`
        );
        await sleep(this.retry.retryDelayMs);
        continue;
      }

      const range = await this.pullRange(latestBlock);
      if (range == null) {
        this.providerPool.reportSuccess(provider);
        console.log(
          `[chunk] provider=${providerLabel} idle (next>${Math.min(
            this.targetBlock,
            latestBlock
          )})`
        );
        await sleep(idleDelay);
        continue;
      }

      console.log(
        `[chunk] provider=${providerLabel} range=${range.fromBlock}-${range.toBlock} latest=${latestBlock}`
      );

      const outcome = await fetchChunk(
        provider.client,
        range,
        this.topics,
        this.address,
        this.retry
      );

      if (outcome.ok) {
        this.scheduler.feedback(outcome.durationMs, true);
        this.providerPool.reportSuccess(provider);
        await onChunk(outcome.result, provider);
        console.log(
          `[chunk] provider=${providerLabel} complete range=${range.fromBlock}-${range.toBlock} duration=${outcome.durationMs.toFixed(
            0
          )}ms logs=${outcome.result.logs.length}`
        );
      } else {
        this.scheduler.feedback(outcome.durationMs, false);
        const cooldown = outcome.isRateLimited
          ? this.retry.rateLimitBackoffMs
          : undefined;
        this.providerPool.reportFailure(provider, cooldown);
        console.warn(
          `[chunk] provider=${providerLabel} failed range=${range.fromBlock}-${range.toBlock} retryable=${outcome.isRetryable} ratelimited=${outcome.isRateLimited} error=${outcome.error.message}`
        );
        await this.handleFailure(range, outcome);
      }
    }
  }

  private async handleFailure(
    range: BlockRange,
    outcome: Extract<ChunkFetchOutcome, { ok: false }>
  ): Promise<void> {
    if (!outcome.isRetryable) {
      throw outcome.error;
    }
    const currentSize = range.toBlock - range.fromBlock + 1;
    const reducedSize = Math.max(
      this.scheduler.minimum,
      Math.floor(currentSize / 2)
    );
    const newRanges = this.splitRange(range, reducedSize);
    for (const r of newRanges.reverse()) {
      await this.requeueFront(r);
    }
  }

  private splitRange(range: BlockRange, maxSize: number): BlockRange[] {
    const ranges: BlockRange[] = [];
    let cursor = range.fromBlock;
    while (cursor <= range.toBlock) {
      const end = Math.min(range.toBlock, cursor + maxSize - 1);
      ranges.push({ fromBlock: cursor, toBlock: end });
      cursor = end + 1;
    }
    return ranges;
  }

  private async pullRange(latestBlock: number): Promise<BlockRange | undefined> {
    return this.withLock(() => {
      if (this.pendingRanges.length > 0) {
        return this.pendingRanges.shift();
      }
      const maxTarget = Math.min(this.targetBlock, latestBlock);
      if (this.nextBlock > maxTarget) {
        return undefined;
      }
      const chunkSize = this.scheduler.next();
      const fromBlock = this.nextBlock;
      const toBlock = Math.min(
        maxTarget,
        fromBlock + chunkSize - 1
      );
      this.nextBlock = toBlock + 1;
      return { fromBlock, toBlock };
    });
  }

  private async requeueFront(range: BlockRange): Promise<void> {
    await this.withLock(() => {
      this.pendingRanges.unshift(range);
    });
  }

  private async acquireProvider(): Promise<ProviderStatus | undefined> {
    const waitMs = Math.max(250, Math.floor(this.retry.retryDelayMs));
    for (;;) {
      if (this.cancelled) {
        return undefined;
      }
      const provider = this.providerPool.acquire();
      if (provider) {
        return provider;
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private async withLock<T>(fn: () => T): Promise<T> {
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return fn();
    } finally {
      release();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

