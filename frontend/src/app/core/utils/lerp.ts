import { Point2D } from '../models/landmark.model';

/**
 * Common interface for 2D cursor smoothing filters.
 * Allows swapping between linear interpolation (Lerp) and adaptive One Euro filtering at runtime.
 */
export interface PointFilter2D {
  filter(raw: Point2D, timestampMs?: number): Point2D;
  reset(): void;
}

/**
 * Standard Linear Interpolation (Lerp) filter:
 * smoothed = prev + (raw - prev) * alpha
 */
export class LerpFilter2D implements PointFilter2D {
  private prev: Point2D | null = null;

  constructor(private alpha: number = 0.35) {}

  setAlpha(alpha: number): void {
    this.alpha = Math.max(0.05, Math.min(1.0, alpha));
  }

  filter(raw: Point2D): Point2D {
    if (!this.prev) {
      this.prev = { x: raw.x, y: raw.y };
      return { ...this.prev };
    }

    const smoothed: Point2D = {
      x: this.prev.x + (raw.x - this.prev.x) * this.alpha,
      y: this.prev.y + (raw.y - this.prev.y) * this.alpha
    };

    this.prev = smoothed;
    return { ...smoothed };
  }

  reset(): void {
    this.prev = null;
  }
}

class LowPassFilter1D {
  private y: number | null = null;
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    if (this.y === null || this.s === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1.0 - alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  hasLastRawValue(): boolean {
    return this.y !== null;
  }

  lastRawValue(): number {
    return this.y ?? 0;
  }

  reset(): void {
    this.y = null;
    this.s = null;
  }
}

/**
 * Adaptive 1€ (One Euro) filter for low-jitter precision at low speeds and low latency at high speeds.
 */
export class OneEuroFilter2D implements PointFilter2D {
  private xFilter = new LowPassFilter1D();
  private yFilter = new LowPassFilter1D();
  private dxFilter = new LowPassFilter1D();
  private dyFilter = new LowPassFilter1D();
  private lastTimeMs: number | null = null;

  constructor(
    private minCutoff: number = 1.15,
    private beta: number = 0.04,
    private dCutoff: number = 1.0
  ) {}

  private computeAlpha(cutoff: number, dtSeconds: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / Math.max(dtSeconds, 0.001));
  }

  filter(raw: Point2D, timestampMs: number = performance.now()): Point2D {
    if (this.lastTimeMs === null || timestampMs <= this.lastTimeMs) {
      this.lastTimeMs = timestampMs;
      return {
        x: this.xFilter.filter(raw.x, 1.0),
        y: this.yFilter.filter(raw.y, 1.0)
      };
    }

    const dtSeconds = Math.max((timestampMs - this.lastTimeMs) / 1000.0, 0.001);
    this.lastTimeMs = timestampMs;

    const dx = this.xFilter.hasLastRawValue()
      ? (raw.x - this.xFilter.lastRawValue()) / dtSeconds
      : 0.0;
    const dy = this.yFilter.hasLastRawValue()
      ? (raw.y - this.yFilter.lastRawValue()) / dtSeconds
      : 0.0;

    const alphaD = this.computeAlpha(this.dCutoff, dtSeconds);
    const edx = this.dxFilter.filter(dx, alphaD);
    const edy = this.dyFilter.filter(dy, alphaD);

    const cutoffX = this.minCutoff + this.beta * Math.abs(edx);
    const cutoffY = this.minCutoff + this.beta * Math.abs(edy);

    return {
      x: this.xFilter.filter(raw.x, this.computeAlpha(cutoffX, dtSeconds)),
      y: this.yFilter.filter(raw.y, this.computeAlpha(cutoffY, dtSeconds))
    };
  }

  reset(): void {
    this.xFilter.reset();
    this.yFilter.reset();
    this.dxFilter.reset();
    this.dyFilter.reset();
    this.lastTimeMs = null;
  }
}

