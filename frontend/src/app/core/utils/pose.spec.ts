import { describe, expect, it } from 'vitest';
import { HandLandmarks } from '../models/landmark.model';
import {
  clampScrollDelta,
  computeScrollDeltaStep,
  computeVSignCursor,
  isVSign
} from './pose';

/**
 * Synthesizes a 21-landmark hand fixture with wrist (0) at (0.5, 0.8) and middle MCP (9) at (0.5, 0.6)
 * so handScale = 0.20.
 */
function createHandFixture(options: {
  indexExtended: boolean;
  middleExtended: boolean;
  ringExtended: boolean;
  pinkyExtended: boolean;
  indexMiddleSpreadNormalized?: number;
  pinching?: boolean;
}): HandLandmarks {
  const wrist = { x: 0.5, y: 0.8, z: 0 };
  const handScale = 0.20;
  const spreadRaw = (options.indexMiddleSpreadNormalized ?? 0.45) * handScale;

  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ ...wrist }));
  lm[0] = wrist;
  lm[9] = { x: 0.5, y: 0.6, z: 0 }; // dist(0, 9) = 0.20

  // Helper to place PIP at distance 0.22 from wrist and Tip either extended (0.34 > 0.22 * 1.15) or curled (0.16 < 0.22 * 1.15)
  const setFinger = (pipIdx: number, tipIdx: number, xOffset: number, extended: boolean) => {
    lm[pipIdx] = { x: 0.5 + xOffset, y: 0.58, z: 0 }; // ~0.22 from wrist
    lm[tipIdx] = {
      x: 0.5 + xOffset,
      y: extended ? 0.44 : 0.68, // extended: ~0.36 from wrist (> 0.22 * 1.15); curled: ~0.12 from wrist
      z: 0
    };
  };

  setFinger(6, 8, -spreadRaw / 2, options.indexExtended);
  setFinger(10, 12, spreadRaw / 2, options.middleExtended);
  setFinger(14, 16, 0.05, options.ringExtended);
  setFinger(18, 20, 0.08, options.pinkyExtended);

  // Thumb tip (4)
  if (options.pinching) {
    lm[4] = { x: lm[8].x + 0.01, y: lm[8].y + 0.01, z: 0 };
  } else {
    lm[4] = { x: 0.36, y: 0.62, z: 0 };
  }

  return lm;
}

describe('Pose Detection (isVSign) & Scroll Delta Math', () => {
  it('recognizes a valid V-sign (peace sign) with index & middle extended and spread > vSpreadMin', () => {
    const vHand = createHandFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: false,
      pinkyExtended: false,
      indexMiddleSpreadNormalized: 0.48
    });
    expect(isVSign(vHand, { vSpreadMin: 0.35 })).toBe(true);
  });

  it('rejects a closed fist (all four fingers curled)', () => {
    const fist = createHandFixture({
      indexExtended: false,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false
    });
    expect(isVSign(fist)).toBe(false);
  });

  it('rejects an open 5-finger palm (ring and pinky also extended)', () => {
    const openPalm = createHandFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: true,
      indexMiddleSpreadNormalized: 0.45
    });
    expect(isVSign(openPalm)).toBe(false);
  });

  it('rejects a pinch pose where middle finger is curled or index/middle are not in a V', () => {
    const pinchPose = createHandFixture({
      indexExtended: false,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false,
      pinching: true
    });
    expect(isVSign(pinchPose)).toBe(false);
  });

  it('rejects two fingers held closed together (spread below vSpreadMin = 0.35)', () => {
    const twoFingersTogether = createHandFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: false,
      pinkyExtended: false,
      indexMiddleSpreadNormalized: 0.22 // < 0.35 threshold
    });
    expect(isVSign(twoFingersTogether, { vSpreadMin: 0.35 })).toBe(false);
  });

  it('computes V-sign cursor at midpoint of landmarks 8 and 12', () => {
    const vHand = createHandFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: false,
      pinkyExtended: false,
      indexMiddleSpreadNormalized: 0.50
    });
    const cursor = computeVSignCursor(vHand);
    expect(cursor.x).toBeCloseTo(0.5, 4);
    expect(cursor.y).toBeCloseTo(0.44, 4);
  });

  it('ignores tiny jitter inside scrollDeadzone (|dy| < 0.002)', () => {
    const res = computeScrollDeltaStep({
      dy: -0.0015,
      scrollDeadzone: 0.002,
      scrollGain: 4000,
      invertScroll: false,
      remainder: 0.4
    });
    expect(res.delta).toBe(0);
    expect(res.remainder).toBeCloseTo(0.4, 5);
  });

  it('scrolls up (positive delta) when hand moves up (dy < 0) and flips sign when invertScroll is true', () => {
    const naturalUp = computeScrollDeltaStep({
      dy: -0.025,
      scrollDeadzone: 0.002,
      scrollGain: 4000,
      invertScroll: false
    });
    expect(naturalUp.delta).toBe(100); // 10 frames of 0.025 (25% height) = 1000 wheel units

    const invertedUp = computeScrollDeltaStep({
      dy: -0.025,
      scrollDeadzone: 0.002,
      scrollGain: 4000,
      invertScroll: true
    });
    expect(invertedUp.delta).toBe(-100);
  });

  it('accumulates fractional remainders across slow movements and clamps large deltas to +-1200', () => {
    let rem = 0;
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const step = computeScrollDeltaStep({
        dy: -0.0022,
        scrollDeadzone: 0.002,
        scrollGain: 250, // Deliberately tiny gain so per-frame raw delta is ~0.36 (< 0.5)
        invertScroll: false,
        remainder: rem
      });
      rem = step.remainder;
      total += step.delta;
    }
    expect(total).toBeGreaterThanOrEqual(3);

    expect(clampScrollDelta(2400)).toBe(1200);
    expect(clampScrollDelta(-1950)).toBe(-1200);
    expect(clampScrollDelta(480)).toBe(480);
  });
});
