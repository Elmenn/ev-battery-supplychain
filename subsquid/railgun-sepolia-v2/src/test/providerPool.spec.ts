import { expect } from "chai";
import { ProviderPool } from "../fetcher/provider-pool";
import { RpcProviderConfig } from "../config";

const PROVIDERS: RpcProviderConfig[] = [
  { url: "https://rpc-1.example", label: "rpc-1" },
  { url: "https://rpc-2.example", label: "rpc-2" },
];

describe("ProviderPool", () => {
  it("rotates through providers in round-robin order", () => {
    const pool = new ProviderPool(PROVIDERS, 5000, 1000);
    const first = pool.acquire();
    const second = pool.acquire();

    expect(first?.config.label).to.equal("rpc-1");
    expect(second?.config.label).to.equal("rpc-2");
  });

  it("skips providers that are cooling down", () => {
    const pool = new ProviderPool(PROVIDERS, 5000, 1000);
    const first = pool.acquire();
    expect(first).to.not.be.undefined;

    if (!first) return;

    pool.reportFailure(first, 10_000);
    const next = pool.acquire();
    expect(next?.config.label).to.equal("rpc-2");

    // Fast-forward cooldown
    first.cooldownUntil = Date.now() - 1;
    const again = pool.acquire();
    expect(again?.config.label).to.equal("rpc-1");
  });

  it("resets failure counters on success", () => {
    const pool = new ProviderPool(PROVIDERS, 5000, 1000);
    const provider = pool.acquire();
    expect(provider).to.not.be.undefined;
    if (!provider) return;

    pool.reportFailure(provider, 1000);
    expect(provider.consecutiveFailures).to.equal(1);

    provider.cooldownUntil = Date.now() - 1;
    pool.reportSuccess(provider);
    expect(provider.consecutiveFailures).to.equal(0);
    expect(provider.cooldownUntil).to.be.undefined;
  });
});



