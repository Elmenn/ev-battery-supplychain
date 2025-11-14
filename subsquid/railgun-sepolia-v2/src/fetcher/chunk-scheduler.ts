import { ChunkSizingConfig } from "../config";

export class ChunkScheduler {
  private current: number;
  private readonly min: number;
  private readonly max: number;
  private readonly growth: number;
  private readonly backoff: number;

  constructor(private readonly config: ChunkSizingConfig) {
    this.current = config.initial;
    this.min = config.min;
    this.max = config.max;
    this.growth = config.growthMultiplier;
    this.backoff = config.backoffMultiplier;
  }

  get minimum(): number {
    return this.min;
  }

  get maximum(): number {
    return this.max;
  }

  get targetDurationMs(): number {
    return this.config.targetDurationMs;
  }

  next(): number {
    return Math.max(this.min, Math.min(this.max, Math.floor(this.current)));
  }

  feedback(durationMs: number, success: boolean): void {
    if (!success) {
      this.current = Math.max(this.min, Math.floor(this.current * this.backoff));
      return;
    }

    if (durationMs > this.config.targetDurationMs * 1.3) {
      // Too slow, reduce slightly.
      this.current = Math.max(
        this.min,
        Math.floor(this.current * Math.max(0.9, this.backoff))
      );
      return;
    }

    if (durationMs < this.config.targetDurationMs * 0.7) {
      // Plenty of headroom, increase.
      this.current = Math.min(
        this.max,
        Math.floor(this.current * this.growth)
      );
      return;
    }

    // Within acceptable range, keep steady.
    this.current = Math.max(this.min, Math.min(this.max, this.current));
  }
}

