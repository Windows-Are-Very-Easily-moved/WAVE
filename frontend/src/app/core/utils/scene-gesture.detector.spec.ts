import { describe, expect, it } from 'vitest';
import { HandLandmarks } from '../models/landmark.model';
import {
  SceneGestureDetector,
  classifyScenePose,
  isThumbTucked
} from './scene-gesture.detector';

/**
 * Synthesizes a 21-landmark hand fixture with wrist (0) at (0.5, 0.8) and middle MCP (9) at (0.5, 0.6)
 * so handScale = 0.20.
 */
function createFixture(options: {
  indexExtended: boolean;
  middleExtended: boolean;
  ringExtended: boolean;
  pinkyExtended: boolean;
  thumbTucked?: boolean;
}): HandLandmarks {
  const wrist = { x: 0.5, y: 0.8, z: 0 };
  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ ...wrist }));
  lm[0] = wrist;
  lm[2] = { x: 0.44, y: 0.72, z: 0 }; // Thumb MCP
  lm[5] = { x: 0.44, y: 0.62, z: 0 }; // Index MCP
  lm[9] = { x: 0.50, y: 0.60, z: 0 }; // Middle MCP
  lm[13] = { x: 0.56, y: 0.62, z: 0 }; // Ring MCP
  lm[17] = { x: 0.60, y: 0.65, z: 0 }; // Pinky MCP

  const setFinger = (pipIdx: number, tipIdx: number, xOffset: number, extended: boolean) => {
    lm[pipIdx] = { x: 0.5 + xOffset, y: 0.58, z: 0 };
    lm[tipIdx] = {
      x: 0.5 + xOffset,
      y: extended ? 0.42 : 0.68,
      z: 0
    };
  };

  setFinger(6, 8, -0.06, options.indexExtended);
  setFinger(10, 12, 0.0, options.middleExtended);
  setFinger(14, 16, 0.06, options.ringExtended);
  setFinger(18, 20, 0.12, options.pinkyExtended);

  // Thumb tip (4)
  if (options.thumbTucked) {
    // Folded across towards palm center / ring MCP
    lm[4] = { x: 0.50, y: 0.64, z: 0 };
  } else {
    // Abducted out to the side (open palm)
    lm[4] = { x: 0.30, y: 0.68, z: 0 };
  }

  return lm;
}

describe('SceneGestureDetector & Pose Classification', () => {
  it('correctly classifies a 3-finger pose (index, middle, ring extended; pinky curled)', () => {
    const hand = createFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: false,
      thumbTucked: false
    });

    expect(classifyScenePose(hand)).toBe(3);
  });

  it('correctly classifies a 4-finger pose when thumb is tucked across palm', () => {
    const hand = createFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: true,
      thumbTucked: true
    });

    expect(isThumbTucked(hand)).toBe(true);
    expect(classifyScenePose(hand)).toBe(4);
  });

  it('rejects an open palm (high-five) with thumb extended outward and returns null', () => {
    const openPalm = createFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: true,
      thumbTucked: false
    });

    expect(isThumbTucked(openPalm)).toBe(false);
    expect(classifyScenePose(openPalm)).toBe(null);
  });

  it('does not collide with V-sign, point, fist, or empty hand', () => {
    const vSign = createFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: false,
      pinkyExtended: false
    });
    expect(classifyScenePose(vSign)).toBe(null);

    const point = createFixture({
      indexExtended: true,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false
    });
    expect(classifyScenePose(point)).toBe(null);

    const fist = createFixture({
      indexExtended: false,
      middleExtended: false,
      ringExtended: false,
      pinkyExtended: false
    });
    expect(classifyScenePose(fist)).toBe(null);

    expect(classifyScenePose(null)).toBe(null);
  });

  it('accumulates hold progress and triggers exactly at holdMs', () => {
    const detector = new SceneGestureDetector({ holdMs: 500, cooldownMs: 1000 });
    const threeHand = createFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: false
    });

    // Frame 0 at t=0
    let res = detector.update(threeHand, 'HOVER', 0.002, 1000);
    expect(res.fingers).toBe(3);
    expect(res.progress).toBe(0);
    expect(res.triggered).toBe(false);

    // Frame 1 at t=250ms (halfway)
    res = detector.update(threeHand, 'HOVER', 0.003, 1250);
    expect(res.fingers).toBe(3);
    expect(res.progress).toBeCloseTo(0.5, 1);
    expect(res.triggered).toBe(false);

    // Frame 2 at t=500ms (complete)
    res = detector.update(threeHand, 'HOVER', 0.002, 1500);
    expect(res.fingers).toBe(3);
    expect(res.progress).toBe(1.0);
    expect(res.triggered).toBe(true);

    // Immediate next frame should be in cooldown
    res = detector.update(threeHand, 'HOVER', 0.002, 1600);
    expect(res.triggered).toBe(false);
    expect(res.cooldownActive).toBe(true);
    expect(res.progress).toBe(0);

    // After cooldown expires (t > 1500 + 1000 = 2500)
    res = detector.update(threeHand, 'HOVER', 0.002, 2600);
    expect(res.cooldownActive).toBe(false);
    expect(res.progress).toBe(0);
  });

  it('aborts hold if engine state is not HOVER or velocity is too high', () => {
    const detector = new SceneGestureDetector({ holdMs: 500 });
    const threeHand = createFixture({
      indexExtended: true,
      middleExtended: true,
      ringExtended: true,
      pinkyExtended: false
    });

    // Start hold
    detector.update(threeHand, 'HOVER', 0.001, 1000);
    let res = detector.update(threeHand, 'HOVER', 0.001, 1200);
    expect(res.progress).toBeGreaterThan(0);

    // Interrupted by non-hover engine state (e.g. GRABBING)
    res = detector.update(threeHand, 'GRABBING', 0.001, 1300);
    expect(res.progress).toBe(0);
    expect(res.triggered).toBe(false);

    // Restart hold
    detector.update(threeHand, 'HOVER', 0.001, 2000);
    // Interrupted by rapid hand motion
    res = detector.update(threeHand, 'HOVER', 0.05, 2200);
    expect(res.progress).toBe(0);
    expect(res.triggered).toBe(false);
  });
});
