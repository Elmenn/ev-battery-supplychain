import { assertNotNull } from "@subsquid/util-internal";

export type RpcProviderConfig = {
  url: string;
  label: string;
  maxRequestsPerSecond?: number;
  maxConcurrentRequests?: number;
};

export type ChunkSizingConfig = {
  initial: number;
  min: number;
  max: number;
  targetDurationMs: number;
  backoffMultiplier: number;
  growthMultiplier: number;
};

export type RetryConfig = {
  rpcTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  rateLimitBackoffMs: number;
  providerCooldownMs: number;
};

export type PipelineConfig = {
  chainId: string;
  contractAddress: string;
  startBlock: number;
  targetBlock?: number;
  topics: string[];
  concurrency: number;
  chunk: ChunkSizingConfig;
  retry: RetryConfig;
  rpcProviders: RpcProviderConfig[];
};

function parseNumber(
  value: string | undefined,
  fallback: number,
  options: { min?: number; max?: number } = {}
): number {
  if (value == null || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value "${value}"`);
  }
  if (options.min != null && parsed < options.min) {
    return options.min;
  }
  if (options.max != null && parsed > options.max) {
    return options.max;
  }
  return parsed;
}

function parseRpcProviders(): RpcProviderConfig[] {
  const raw = process.env.RPC_PROVIDER_URLS ?? process.env.RPC_ENDPOINT;
  if (raw == null || raw.trim().length === 0) {
    throw new Error(
      "RPC_PROVIDER_URLS environment variable must be provided (comma-separated list)"
    );
  }

  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((url, index) => {
      const label = process.env[`RPC_PROVIDER_${index}_LABEL`] ?? `rpc-${index}`;
      const maxRpsEnv = process.env[`RPC_PROVIDER_${index}_MAX_RPS`];
      const maxConcurrencyEnv =
        process.env[`RPC_PROVIDER_${index}_MAX_CONCURRENCY`];
      return {
        url,
        label,
        maxRequestsPerSecond:
          maxRpsEnv != null ? parseNumber(maxRpsEnv, Infinity, { min: 1 }) : undefined,
        maxConcurrentRequests:
          maxConcurrencyEnv != null
            ? parseNumber(maxConcurrencyEnv, Infinity, { min: 1 })
            : undefined,
      };
    });
}

function defaultTopics(): string[] {
  const topics = process.env.RAILGUN_TOPIC0_LIST;
  if (topics != null && topics.trim().length > 0) {
    return topics
      .split(",")
      .map((topic) => topic.trim().toLowerCase())
      .filter((topic) => topic.startsWith("0x") && topic.length === 66);
  }
  // Fallback topics align with existing processor definition.
  return [
    "0x913f37db78332f849cfa1bd1e2c8ec4883c59de4cd7e0d37afb0db1f2fd81279", // Nullifiers
    "0x3e0c963fea53b0fcbf2cdd7c489bc89b4b8e754122ed8978fa6199a4a83683f5", // Nullified
    "0x576241e3dfd6400ed1d5d295df1c548d652e71771df4cf0a1d57b36aa0f5bd6e", // CommitmentBatch
    "0x40d24525c70cf36c6b0c12f8714d575d4362c60207e675985d8dfe8e94cf2366", // GeneratedCommitmentBatch
    "0x68b3fdb1a4c3eae3c9bdc5ff0bb0c502cca3d5cf93d01316e5f583eea7e2d1d8", // Transact
    "0xcbd77adbf28dc35edae86fef0fa7d061caf6ffa7f874a80a4ddb9f0086f95ba8", // Unshield
    "0xb68f1c1a7060d2ff6c7372ef0fdd7ac41b8a6fa7f992d531454515fe08e0bcf4", // Shield (legacy)
    "0x7ef233c6f0ca6c584108a52d69f96455ce49963cf343577b6c7d429f775d390b", // Shield (new)
  ];
}

export function loadConfig(): PipelineConfig {
  const chainId = assertNotNull(
    process.env.CHAIN_ID,
    "CHAIN_ID environment variable is required"
  );
  const contractAddress = assertNotNull(
    process.env.RAILGUN_PROXY_CONTRACT_ADDRESS,
    "RAILGUN_PROXY_CONTRACT_ADDRESS environment variable is required"
  ).toLowerCase();

  const startBlock = parseNumber(
    process.env.RAILGUN_PROXY_DEPLOYMENT_BLOCK,
    0,
    { min: 0 }
  );

  const targetBlock = process.env.TARGET_BLOCK
    ? parseNumber(process.env.TARGET_BLOCK, Number.MAX_SAFE_INTEGER, {
        min: startBlock,
      })
    : undefined;

  const chunkInitial = parseNumber(process.env.CHUNK_SIZE_INITIAL, 12000, {
    min: 100,
    max: 50000,
  });
  const chunkMin = parseNumber(process.env.CHUNK_SIZE_MIN, 2000, {
    min: 100,
    max: chunkInitial,
  });
  const chunkMax = parseNumber(process.env.CHUNK_SIZE_MAX, 24000, {
    min: chunkInitial,
    max: 100000,
  });

  const chunkTargetDurationMs = parseNumber(
    process.env.CHUNK_TARGET_DURATION_MS,
    15000,
    { min: 1000 }
  );

  const chunkBackoffMultiplier = parseNumber(
    process.env.CHUNK_BACKOFF_MULTIPLIER,
    0.5,
    { min: 0.1, max: 0.9 }
  );

  const chunkGrowthMultiplier = parseNumber(
    process.env.CHUNK_GROWTH_MULTIPLIER,
    1.3,
    { min: 1.01, max: 3.0 }
  );

  const concurrency = parseNumber(process.env.FETCH_CONCURRENCY, 4, {
    min: 1,
    max: 16,
  });

  const retryConfig: RetryConfig = {
    rpcTimeoutMs: parseNumber(process.env.RPC_TIMEOUT_MS, 20000, {
      min: 1000,
    }),
    maxRetries: parseNumber(process.env.RPC_MAX_RETRIES, 5, { min: 0 }),
    retryDelayMs: parseNumber(process.env.RPC_RETRY_DELAY_MS, 250, {
      min: 0,
    }),
    rateLimitBackoffMs: parseNumber(
      process.env.RPC_RATE_LIMIT_BACKOFF_MS,
      10000,
      { min: 1000 }
    ),
    providerCooldownMs: parseNumber(
      process.env.RPC_PROVIDER_COOLDOWN_MS,
      45000,
      { min: 1000 }
    ),
  };

  return {
    chainId,
    contractAddress,
    startBlock,
    targetBlock,
    topics: defaultTopics(),
    concurrency,
    chunk: {
      initial: chunkInitial,
      min: chunkMin,
      max: chunkMax,
      targetDurationMs: chunkTargetDurationMs,
      backoffMultiplier: chunkBackoffMultiplier,
      growthMultiplier: chunkGrowthMultiplier,
    },
    retry: retryConfig,
    rpcProviders: parseRpcProviders(),
  };
}



