import { DataSource } from "typeorm";
import { loadConfig } from "./config";
import { createDataSource } from "./db/data-source";
import { BulkWriter, PersistableBatch } from "./db/bulk-writer";
import { CheckpointStore } from "./db/checkpoint-store";
import { ProviderPool } from "./fetcher/provider-pool";
import { ChunkScheduler } from "./fetcher/chunk-scheduler";
import { ChunkOrchestrator } from "./fetcher/chunk-orchestrator";
import { convertChunkToBlocks } from "./pipeline/chunk-transform";
import { processBlocks } from "./pipeline/block-processor";
import { MemoryStore } from "./pipeline/memory-store";
import { ProcessingContext } from "./pipeline/context";
import { VerificationHash } from "./model";
import { ChunkResult } from "./fetcher/types";
import { ProviderStatus } from "./fetcher/provider-pool";

type TreePointer = {
  treeNumber: number;
  treePosition: number;
};

async function main(): Promise<void> {
  const config = loadConfig();

  const dataSource = await createDataSource();
  try {
    const bulkWriter = new BulkWriter(dataSource);
    const checkpointStore = new CheckpointStore(dataSource);
    await checkpointStore.init();

    const checkpointId = `railgun-${config.chainId}`;
    const checkpoint = await checkpointStore.load(checkpointId);

    let resumeBlock =
      checkpoint != null ? checkpoint.blockNumber + 1 : config.startBlock;
    let treePointer: TreePointer =
      checkpoint != null
        ? {
            treeNumber: checkpoint.commitmentTreeNumber,
            treePosition: checkpoint.commitmentTreePosition,
          }
        : { treeNumber: 0, treePosition: 0 };

    let verificationHashSeed = await loadVerificationHash(dataSource);

    const runConfig = { ...config, startBlock: resumeBlock };
    const providerPool = new ProviderPool(
      runConfig.rpcProviders,
      runConfig.retry.rpcTimeoutMs,
      runConfig.retry.providerCooldownMs
    );
    const scheduler = new ChunkScheduler(runConfig.chunk);
    const orchestrator = new ChunkOrchestrator(runConfig, providerPool, scheduler);

    await orchestrator.run(async (chunk, provider) => {
      await handleChunk({
        chunk,
        provider,
        bulkWriter,
        checkpointStore,
        checkpointId,
        contractAddress: runConfig.contractAddress,
        verificationHashSeed,
        treePointer,
      }).then((result) => {
        verificationHashSeed = result.verificationHashSeed;
        treePointer = result.treePointer;
        resumeBlock = chunk.range.toBlock + 1;
      });
    });
  } finally {
    await dataSource.destroy();
  }
}

async function handleChunk(params: {
  chunk: ChunkResult;
  provider: ProviderStatus;
  bulkWriter: BulkWriter;
  checkpointStore: CheckpointStore;
  checkpointId: string;
  contractAddress: string;
  verificationHashSeed?: VerificationHash;
  treePointer: TreePointer;
}): Promise<{ verificationHashSeed?: VerificationHash; treePointer: TreePointer }> {
  const {
    chunk,
    provider,
    bulkWriter,
    checkpointStore,
    checkpointId,
    contractAddress,
    treePointer,
  } = params;

  const blocks = convertChunkToBlocks(chunk);

  const memoryStore = new MemoryStore(
    params.verificationHashSeed
      ? { verificationHashes: [params.verificationHashSeed] }
      : {}
  );

  const context: ProcessingContext = {
    store: memoryStore,
    blocks: [],
    _chain: {
      client: {
        call: (method, requestParams) =>
          provider.client.call(method, requestParams ?? []),
      },
    },
  };

  let batch: PersistableBatch = {};
  if (blocks.length > 0) {
    const { batch: processedBatch, verificationHash } = await processBlocks(
      context,
      blocks,
      contractAddress
    );
    batch = processedBatch;

    await bulkWriter.persist(batch);

    if (verificationHash) {
      params.verificationHashSeed = verificationHash;
    }
  }

  const updatedPointer = updateTreePointer(treePointer, batch);
  await checkpointStore.save(checkpointId, {
    blockNumber: chunk.range.toBlock,
    commitmentTreeNumber: updatedPointer.treeNumber,
    commitmentTreePosition: updatedPointer.treePosition,
  });

  return {
    verificationHashSeed: params.verificationHashSeed,
    treePointer: updatedPointer,
  };
}

async function loadVerificationHash(
  dataSource: DataSource
): Promise<VerificationHash | undefined> {
  const rows = await dataSource.query(
    `SELECT id, verification_hash FROM verification_hash WHERE id = $1 LIMIT 1`,
    ["0x"]
  );

  if (rows.length === 0) {
    return undefined;
  }

  const row = rows[0];
  const bytes: Uint8Array =
    row.verification_hash instanceof Buffer
      ? new Uint8Array(
          row.verification_hash.buffer,
          row.verification_hash.byteOffset,
          row.verification_hash.byteLength
        )
      : new Uint8Array(row.verification_hash ?? []);

  return new VerificationHash({
    id: row.id,
    verificationHash: bytes,
  });
}

function updateTreePointer(
  previous: TreePointer,
  batch: PersistableBatch
): TreePointer {
  let result = { ...previous };

  const consider = (entries?: { treeNumber: number; treePosition: number }[]) => {
    if (!entries) return;
    for (const entry of entries) {
      if (
        entry.treeNumber > result.treeNumber ||
        (entry.treeNumber === result.treeNumber &&
          entry.treePosition > result.treePosition)
      ) {
        result = {
          treeNumber: entry.treeNumber,
          treePosition: entry.treePosition,
        };
      }
    }
  };

  consider(batch.legacyEncryptedCommitments);
  consider(batch.legacyGeneratedCommitments);
  consider(batch.transactCommitments);
  consider(batch.shieldCommitments);

  return result;
}

main().catch((error) => {
  console.error("Fatal error during ingestion", error);
  process.exitCode = 1;
});
