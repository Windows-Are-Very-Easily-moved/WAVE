import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, ScepterSettings } from '../models/gesture.model';
import { HandLandmarks, Point2D } from '../models/landmark.model';
import { GestureStateMachine } from './gesture-engine.service';
import { mirrorX } from '../utils/geometry';
import { LerpFilter2D } from '../utils/lerp';

/**
 * Helper to synthesize a 21-landmark hand where:
 * - Wrist (0) and Middle MCP (9) are separated by 0.20 (standard arm's-length hand scale)
 * - Thumb tip (4) and Index tip (8) are centered around `mirroredCursor` with `rawPinchDist` separation.
 * Note: Because `processLandmarks` mirrors X (`1 - x`), we pass unmirrored X (`1 - mirroredCursor.x`).
 */
function createSyntheticHand(mirroredCursor: Point2D, rawPinchDist: number, handScale = 0.20): HandLandmarks {
  const unmirroredX = mirrorX(mirroredCursor.x);
  const y = mirroredCursor.y;

  const landmarks: HandLandmarks = Array.from({ length: 21 }, () => ({
    x: unmirroredX,
    y,
    z: 0
  }));

  // Set wrist (0) and middle MCP (9) to define hand size = handScale
  landmarks[0] = { x: unmirroredX, y: Math.min(1, y + handScale), z: 0 };
  landmarks[9] = { x: unmirroredX, y, z: 0 };

  // Set thumb tip (4) and index tip (8) separated vertically by rawPinchDist around cursor
  landmarks[4] = { x: unmirroredX, y: y - rawPinchDist / 2, z: 0 };
  landmarks[8] = { x: unmirroredX, y: y + rawPinchDist / 2, z: 0 };

  return landmarks;
}

/**
 * Helper to synthesize a V-sign hand centered at `mirroredCursor` with index (8) & middle (12) extended
 * and ring (16) & pinky (20) curled.
 */
function createSyntheticVSignHand(
  mirroredCursor: Point2D,
  rawPinchDist = 0.14,
  handScale = 0.20
): HandLandmarks {
  const unmirroredX = mirrorX(mirroredCursor.x);
  const tipY = mirroredCursor.y;
  const wristY = Math.min(1, tipY + 0.36);

  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({
    x: unmirroredX,
    y: wristY,
    z: 0
  }));

  lm[0] = { x: unmirroredX, y: wristY, z: 0 };
  lm[9] = { x: unmirroredX, y: wristY - handScale, z: 0 };

  // Spread index (8) and middle (12) horizontally by 0.10 (normalized spread = 0.10 / 0.20 = 0.50 > 0.35)
  lm[6] = { x: unmirroredX - 0.05, y: wristY - 0.20, z: 0 };
  lm[8] = { x: unmirroredX - 0.05, y: tipY, z: 0 };

  lm[10] = { x: unmirroredX + 0.05, y: wristY - 0.20, z: 0 };
  lm[12] = { x: unmirroredX + 0.05, y: tipY, z: 0 };

  // Ring (16) and pinky (20) curled close to wrist
  lm[14] = { x: unmirroredX + 0.06, y: wristY - 0.20, z: 0 };
  lm[16] = { x: unmirroredX + 0.06, y: wristY - 0.12, z: 0 };
  lm[18] = { x: unmirroredX + 0.08, y: wristY - 0.20, z: 0 };
  lm[20] = { x: unmirroredX + 0.08, y: wristY - 0.12, z: 0 };

  // Thumb tip (4) separated from index tip (8) by rawPinchDist
  lm[4] = { x: lm[8].x, y: lm[8].y + rawPinchDist, z: 0 };

  return lm;
}

describe('GestureStateMachine & Geometry', () => {
  const fastSettings: ScepterSettings = {
    ...DEFAULT_SETTINGS,
    lerpAlpha: 1.0, // Disable smoothing lag for deterministic unit test coordinate assertions
    pinchEnterThreshold: 0.28,
    pinchExitMultiplier: 1.5, // Exit threshold = 0.42
    edgeZoneSize: 0.20,
    dwellTimeMs: 150,
    cooldownMs: 800,
    dragDeadzone: 0.025,
    trackingLossGraceMs: 300
  };

  it('transitions IDLE -> HOVER -> GRABBING -> DRAGGING -> RELEASED and fires snap after dwell', () => {
    const sm = new GestureStateMachine(fastSettings);
    expect(sm.getState()).toBe('IDLE');

    // 1. Hand appears open at center (0.5, 0.5) -> HOVER
    const openHandCenter = createSyntheticHand({ x: 0.5, y: 0.5 }, 0.12); // normalized = 0.60 (> 0.28)
    let snap = sm.processLandmarks([openHandCenter], 100);
    expect(snap.state).toBe('HOVER');
    expect(snap.isPinching).toBe(false);

    // 2. Pinch closes at center (raw 0.04 -> normalized 0.20 <= 0.28) -> GRABBING + grabIssued
    const pinchedCenter = createSyntheticHand({ x: 0.5, y: 0.5 }, 0.04);
    snap = sm.processLandmarks([pinchedCenter], 200);
    expect(snap.state).toBe('GRABBING');
    expect(snap.isPinching).toBe(true);
    expect(snap.grabIssued).toBeDefined();
    expect(snap.grabIssued?.x).toBeCloseTo(0.5, 3);

    // 3. Move pinched hand into left edge zone (x = 0.10, y = 0.50) -> DRAGGING, zone hovered but not armed yet
    const pinchedLeftZone = createSyntheticHand({ x: 0.10, y: 0.50 }, 0.04);
    snap = sm.processLandmarks([pinchedLeftZone], 250);
    expect(snap.state).toBe('DRAGGING');
    expect(snap.hoveredZone).toBe('left');
    expect(snap.armedZone).toBeNull();

    // 4. Dwell in left zone for 150ms (t = 400ms) -> zone becomes ARMED
    snap = sm.processLandmarks([pinchedLeftZone], 405);
    expect(snap.armedZone).toBe('left');
    expect(snap.dwellProgress).toBe(1);

    // 5. Release pinch inside armed left zone -> RELEASED + snapIssued('left')
    const releasedLeftZone = createSyntheticHand({ x: 0.10, y: 0.50 }, 0.12);
    snap = sm.processLandmarks([releasedLeftZone], 450);
    expect(snap.state).toBe('RELEASED');
    expect(snap.snapIssued).toEqual({ position: 'left', ratio: 0.5 });
  });

  it('prevents pinch flicker using hysteresis between enter (0.28) and exit (0.42) thresholds', () => {
    const sm = new GestureStateMachine(fastSettings);

    // Enter pinch at normalized = 0.25 (<= 0.28)
    let snap = sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.5 }, 0.05)], 100);
    expect(snap.isPinching).toBe(true);
    expect(snap.state).toBe('GRABBING');

    // Slight finger jitter opens distance to normalized = 0.35 (above enter 0.28, but below exit 0.42)
    // Hysteresis MUST keep pinch active without dropping the grab!
    snap = sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.5 }, 0.07)], 150);
    expect(snap.isPinching).toBe(true);
    expect(snap.state).toBe('GRABBING');

    // Opening beyond exit threshold (normalized = 0.45 >= 0.42) exits pinch cleanly
    snap = sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.5 }, 0.09)], 200);
    expect(snap.isPinching).toBe(false);
    expect(snap.state).toBe('RELEASED');
  });

  it('tolerates brief tracking loss (<300ms) during a grab and cancels if >300ms', () => {
    const sm = new GestureStateMachine(fastSettings);

    // Start grab at t = 100ms
    sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.5 }, 0.04)], 100);
    expect(sm.getState()).toBe('GRABBING');

    // Hand disappears for 200ms (t = 300ms) -> still GRABBING
    let lostSnap = sm.processLandmarks([], 300);
    expect(lostSnap.state).toBe('GRABBING');
    expect(lostSnap.isPinching).toBe(true);

    // Hand disappears for 450ms total (t = 550ms > 300ms grace) -> cancels grab to IDLE
    lostSnap = sm.processLandmarks([], 550);
    expect(lostSnap.state).toBe('IDLE');
    expect(lostSnap.isPinching).toBe(false);
  });

  it('enforces cooldown between consecutive snaps and ignores releases outside armed zones', () => {
    const sm = new GestureStateMachine(fastSettings);

    // Release outside any zone cancels grab without firing snap
    sm.processPointerSimulation({ x: 0.5, y: 0.5 }, true, 100);
    const centerRelease = sm.processPointerSimulation({ x: 0.5, y: 0.5 }, false, 300);
    expect(centerRelease.snapIssued).toBeUndefined();

    // First valid snap in right zone at t = 600ms
    sm.processPointerSimulation({ x: 0.9, y: 0.5 }, true, 400);
    sm.processPointerSimulation({ x: 0.9, y: 0.5 }, true, 560); // Dwell > 150ms
    const firstSnap = sm.processPointerSimulation({ x: 0.9, y: 0.5 }, false, 600);
    expect(firstSnap.snapIssued?.position).toBe('right');

    // Second snap attempted only 300ms later (t = 900ms < 800ms cooldown) -> suppressed
    sm.processPointerSimulation({ x: 0.1, y: 0.5 }, true, 700);
    sm.processPointerSimulation({ x: 0.1, y: 0.5 }, true, 860);
    const suppressedSnap = sm.processPointerSimulation({ x: 0.1, y: 0.5 }, false, 900);
    expect(suppressedSnap.snapIssued).toBeUndefined();
  });

  it('smooths jittery coordinates with LerpFilter2D', () => {
    const filter = new LerpFilter2D(0.35);
    const first = filter.filter({ x: 0.0, y: 0.0 });
    expect(first).toEqual({ x: 0.0, y: 0.0 });

    const second = filter.filter({ x: 1.0, y: 1.0 });
    expect(second.x).toBeCloseTo(0.35, 5);
    expect(second.y).toBeCloseTo(0.35, 5);
  });

  it('detects an open-hand upward swipe in HOVER state to cycle windows and ignores downward return motion', () => {
    const sm = new GestureStateMachine(fastSettings);

    // Downward motion (y = 0.25 -> 0.70) is ignored so resetting hand position never reverses the cycle
    sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.25 }, 0.14)], 100);
    sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.45 }, 0.14)], 180);
    let downSnap = sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.70 }, 0.14)], 260);
    expect(downSnap.cycleIssued).toBeUndefined();

    // Upward swipe (y = 0.70 -> 0.45 -> 0.25) triggers 'next' window cycle
    sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.70 }, 0.14)], 1200);
    sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.45 }, 0.14)], 1280);
    const upSnap = sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.25 }, 0.14)], 1360);
    expect(upSnap.cycleIssued).toEqual({ direction: 'next' });
  });

  it('enters SCROLLING when V-sign holds for scrollEnterMs (120ms), emits begin+deltas, and exits after scrollExitMs (150ms)', () => {
    const sm = new GestureStateMachine(fastSettings);

    // 1. V-sign starts at (0.5, 0.5) at t = 100ms -> still HOVER before 120ms dwell
    let snap = sm.processLandmarks([createSyntheticVSignHand({ x: 0.5, y: 0.5 })], 100);
    expect(snap.state).toBe('HOVER');
    expect(snap.scrollIssued).toBeUndefined();

    // 2. V-sign held at t = 225ms (>= 120ms) -> enters SCROLLING and emits begin: true with delta: 0
    snap = sm.processLandmarks([createSyntheticVSignHand({ x: 0.5, y: 0.5 })], 225);
    expect(snap.state).toBe('SCROLLING');
    expect(snap.scrollIssued).toEqual({
      delta: 0,
      begin: true,
      x: 0.5,
      y: 0.5
    });

    // 3. Move V-sign hand UP (y = 0.5 -> 0.475, dy = -0.025) -> positive wheel delta (scroll up)
    snap = sm.processLandmarks([createSyntheticVSignHand({ x: 0.5, y: 0.475 })], 265);
    expect(snap.state).toBe('SCROLLING');
    expect(snap.scrollIssued?.delta).toBe(100);
    expect(snap.scrollIssued?.begin).toBeUndefined();

    // 4. Lose V-sign briefly for 80ms (< 150ms scrollExitMs) -> stays in SCROLLING
    snap = sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.475 }, 0.14)], 345);
    expect(snap.state).toBe('SCROLLING');

    // 5. V-sign lost for 160ms total (>= 150ms scrollExitMs) -> exits SCROLLING to HOVER
    snap = sm.processLandmarks([createSyntheticHand({ x: 0.5, y: 0.475 }, 0.14)], 505);
    expect(snap.state).toBe('HOVER');
  });

  it('gives pinch priority over SCROLLING and exits SCROLLING immediately on hand loss', () => {
    const sm = new GestureStateMachine(fastSettings);

    // Enter SCROLLING
    sm.processLandmarks([createSyntheticVSignHand({ x: 0.5, y: 0.5 })], 100);
    let snap = sm.processLandmarks([createSyntheticVSignHand({ x: 0.5, y: 0.5 })], 230);
    expect(snap.state).toBe('SCROLLING');

    // Start pinching while fingers are in V-sign -> Pinch wins immediately -> GRABBING
    snap = sm.processLandmarks([createSyntheticVSignHand({ x: 0.5, y: 0.5 }, 0.03)], 270);
    expect(snap.state).toBe('GRABBING');
    expect(snap.isPinching).toBe(true);
    expect(snap.grabIssued).toBeDefined();

    // Re-enter SCROLLING on a fresh state machine and verify hand loss exits to IDLE immediately
    const sm2 = new GestureStateMachine(fastSettings);
    sm2.processPointerSimulation({ x: 0.4, y: 0.6 }, false, 100, true);
    snap = sm2.processPointerSimulation({ x: 0.4, y: 0.6 }, false, 230, true);
    expect(snap.state).toBe('SCROLLING');

    const lost = sm2.processPointerSimulation(null, false, 270, false);
    expect(lost.state).toBe('IDLE');
  });
});

