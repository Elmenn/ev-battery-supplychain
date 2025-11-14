import { RpcProviderConfig } from "../config";
import { JsonRpcClient } from "../rpc/json-rpc";

export type ProviderStatus = {
  config: RpcProviderConfig;
  client: JsonRpcClient;
  cooldownUntil?: number;
  consecutiveFailures: number;
};

export class ProviderPool {
  private readonly providers: ProviderStatus[];
  private readonly timeoutMs: number;
  private cursor = 0;

  constructor(
    configs: RpcProviderConfig[],
    timeoutMs: number,
    private readonly cooldownMs: number
  ) {
    this.timeoutMs = timeoutMs;
    this.providers = configs.map((cfg) => ({
      config: cfg,
      client: new JsonRpcClient(cfg.url, cfg.label, timeoutMs),
      consecutiveFailures: 0,
    }));

    if (this.providers.length === 0) {
      throw new Error("At least one RPC provider must be configured");
    }
  }

  acquire(): ProviderStatus | undefined {
    const now = Date.now();
    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const index = (this.cursor + attempt) % this.providers.length;
      const provider = this.providers[index];
      if (provider.cooldownUntil && provider.cooldownUntil > now) {
        continue;
      }
      this.cursor = (index + 1) % this.providers.length;
      return provider;
    }
    return undefined;
  }

  reportSuccess(status: ProviderStatus): void {
    status.consecutiveFailures = 0;
    status.cooldownUntil = undefined;
  }

  reportFailure(status: ProviderStatus, cooldownMs?: number): void {
    status.consecutiveFailures += 1;
    status.cooldownUntil = Date.now() + (cooldownMs ?? this.cooldownMs);
  }

  all(): ProviderStatus[] {
    return this.providers;
  }
}



