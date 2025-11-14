import { expect } from "chai";
import { ChunkScheduler } from "../fetcher/chunk-scheduler";
import { ChunkSizingConfig } from "../config";

const BASE_CONFIG: ChunkSizingConfig = {
  initial: 12000,
  min: 3000,
  max: 24000,
  targetDurationMs: 15000,
  backoffMultiplier: 0.5,
  growthMultiplier: 1.3,
};

describe("ChunkScheduler", () => {
  it("returns initial chunk size within bounds", () => {
    const scheduler = new ChunkScheduler(BASE_CONFIG);
    expect(scheduler.next()).to.equal(BASE_CONFIG.initial);
  });

  it("reduces chunk size after failure feedback", () => {
    const scheduler = new ChunkScheduler(BASE_CONFIG);
    scheduler.feedback(20000, false);
    expect(scheduler.next()).to.equal(BASE_CONFIG.initial * BASE_CONFIG.backoffMultiplier);
  });

  it("increases chunk size when workload is light", () => {
    const scheduler = new ChunkScheduler(BASE_CONFIG);
    scheduler.feedback(BASE_CONFIG.targetDurationMs * 0.4, true);
    expect(scheduler.next()).to.equal(
      Math.floor(BASE_CONFIG.initial * BASE_CONFIG.growthMultiplier)
    );
  });

  it("floors growth at configured maximum", () => {
    const scheduler = new ChunkScheduler({
      ...BASE_CONFIG,
      initial: 23000,
    });
    scheduler.feedback(BASE_CONFIG.targetDurationMs * 0.4, true);
    expect(scheduler.next()).to.equal(BASE_CONFIG.max);
  });

  it("floors backoff at configured minimum", () => {
    const scheduler = new ChunkScheduler({
      ...BASE_CONFIG,
      initial: 4000,
    });
    scheduler.feedback(BASE_CONFIG.targetDurationMs * 2, false);
    expect(scheduler.next()).to.equal(BASE_CONFIG.min);
  });
});



