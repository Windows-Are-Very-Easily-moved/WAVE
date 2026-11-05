import { HandLandmarks, Point2D } from '../models/landmark.model';
import {
  INDEX_TIP_LANDMARK,
  MIDDLE_MCP_LANDMARK,
  WRIST_LANDMARK,
  euclideanDistance2D,
  midpoint2D
} from './geometry';

export const INDEX_PIP_LANDMARK = 6;
export const MIDDLE_PIP_LANDMARK = 10;
export const MIDDLE_TIP_LANDMARK = 12;
export const RING_PIP_LANDMARK = 14;
export const RING_TIP_LANDMARK = 16;
export const PINKY_PIP_LANDMARK = 18;
export const PINKY_TIP_LANDMARK = 20;

/**
 * Finger extension ratio multiplier: a finger is considered extended when
 * dist(tip, wrist) > dist(pip, wrist) * FINGER_EXTENSION_RATIO.
 * Using radial distance from the wrist makes pose detection orientation-independent.
 */
export const FINGER_EXTENSION_RATIO = 1.15;

export interface VSignConfig {
  /**
   * Minimum distance between index tip (8) and middle tip (12), normalized by
   * hand size (wrist 0 to middle MCP 9), required to classify as a V-sign
   * rather than two fingers held closed together. Default: 0.35.
   */
  vSpreadMin?: number;
}

/**
 * Orientation-independent check for whether a single finger is extended:
 * returns true if dist2D(tip, wrist) > dist2D(pip, wrist) * 1.15.
 */
export function isFingerExtended(
  landmarks: HandLandmarks,
  tipIndex: number,
  pipIndex: number,
  extensionMultiplier: number = FINGER_EXTENSION_RATIO
): boolean {
  const wrist = landmarks[WRIST_LANDMARK];
  const tip = landmarks[tipIndex];
  const pip = landmarks[pipIndex];
  if (!wrist || !tip || !pip) {
    return false;
  }

  const tipToWrist = euclideanDistance2D(tip, wrist);
  const pipToWrist = euclideanDistance2D(pip, wrist);
  return tipToWrist > pipToWrist * extensionMultiplier;
}

/**
 * Pure, orientation-independent V-sign (peace sign) pose detector.
 *
 * Criteria:
 * 1. Index (8/6) AND middle (12/10) fingers are extended: dist(tip, wrist) > dist(PIP, wrist) * 1.15.
 * 2. Ring (16/14) AND pinky (20/18) fingers are NOT extended (curled down).
 * 3. Thumb is ignored.
 * 4. Index-to-middle fingertip spread dist(8, 12), normalized by hand size (wrist 0 to middle MCP 9),
 *    is strictly above `vSpreadMin` (default 0.35), separating a true V sign from two fingers held together.
 */
export function isVSign(landmarks: HandLandmarks, config: VSignConfig = {}): boolean {
  if (!landmarks || landmarks.length < 21) {
    return false;
  }

  const vSpreadMin = config.vSpreadMin ?? 0.35;

  const indexExtended = isFingerExtended(landmarks, INDEX_TIP_LANDMARK, INDEX_PIP_LANDMARK);
  const middleExtended = isFingerExtended(landmarks, MIDDLE_TIP_LANDMARK, MIDDLE_PIP_LANDMARK);
  if (!indexExtended || !middleExtended) {
    return false;
  }

  const ringExtended = isFingerExtended(landmarks, RING_TIP_LANDMARK, RING_PIP_LANDMARK);
  const pinkyExtended = isFingerExtended(landmarks, PINKY_TIP_LANDMARK, PINKY_PIP_LANDMARK);
  if (ringExtended || pinkyExtended) {
    return false;
  }

  const wrist = landmarks[WRIST_LANDMARK];
  const middleMcp = landmarks[MIDDLE_MCP_LANDMARK];
  const indexTip = landmarks[INDEX_TIP_LANDMARK];
  const middleTip = landmarks[MIDDLE_TIP_LANDMARK];

  const handScale = Math.max(euclideanDistance2D(wrist, middleMcp), 0.05);
  const tipSpread = euclideanDistance2D(indexTip, middleTip);
  const normalizedSpread = tipSpread / handScale;

  return normalizedSpread > vSpreadMin;
}

/**
 * Computes the reference cursor point for V-sign scrolling:
 * the midpoint of index fingertip (#8) and middle fingertip (#12) on already-mirrored landmarks,
 * clamped to [0..1].
 */
export function computeVSignCursor(mirroredHand: HandLandmarks): Point2D {
  const indexTip = mirroredHand[INDEX_TIP_LANDMARK];
  const middleTip = mirroredHand[MIDDLE_TIP_LANDMARK];
  const mid = midpoint2D(indexTip, middleTip);
  return {
    x: Math.max(0, Math.min(1, mid.x)),
    y: Math.max(0, Math.min(1, mid.y))
  };
}

/**
 * Reference per-frame displacement (2.5% of frame height, i.e., 10 frames to traverse 25% of frame height)
 * used to normalize the |dy|^1.2 acceleration curve so moving across 25% of frame height yields ~1000 wheel units
 * at default scrollGain = 4000.
 */
const SCROLL_ACCEL_REF_DY = 0.025;
const SCROLL_ACCEL_SCALE = Math.pow(SCROLL_ACCEL_REF_DY, -0.2); // ~2.0913

export const MAX_SCROLL_REQUEST_DELTA = 1200;

export interface ScrollStepParams {
  /** Frame-over-frame vertical movement: dy = smoothedY - prevSmoothedY (screen Y grows downward). */
  dy: number;
  /** Minimum |dy| required to register scroll movement (default 0.002). */
  scrollDeadzone: number;
  /** Gain multiplier converting normalized Y travel to wheel units (default 4000). */
  scrollGain: number;
  /** When true, flips the sign of the computed wheel delta. */
  invertScroll: boolean;
  /** Fractional wheel remainder carried over from previous frames. */
  remainder?: number;
}

export interface ScrollStepResult {
  /** Integer wheel delta emitted by this step (positive = scroll up, negative = scroll down). */
  delta: number;
  /** Updated fractional remainder to carry into the next frame. */
  remainder: number;
}

/**
 * Pure per-frame scroll wheel calculation with deadzone, mild |dy|^1.2 acceleration curve,
 * inversion option, and fractional remainder accumulation.
 *
 * Sign convention:
 * - Screen Y grows downward: moving the hand UP produces negative `dy`.
 * - `-dy` is positive when moving UP, so `delta > 0` scrolls UP (natural touchscreen drag feel).
 * - Setting `invertScroll = true` flips the sign.
 */
export function computeScrollDeltaStep(params: ScrollStepParams): ScrollStepResult {
  const { dy, scrollDeadzone, scrollGain, invertScroll, remainder = 0 } = params;

  if (!Number.isFinite(dy) || Math.abs(dy) < scrollDeadzone) {
    return { delta: 0, remainder };
  }

  const absDy = Math.abs(dy);
  // Apply mild acceleration curve |dy|^1.2 scaled so |dy| = 0.025 maps to 0.025 (10 frames across 25% height = 1000 units)
  const curvedMagnitude = Math.pow(absDy, 1.2) * SCROLL_ACCEL_SCALE;
  const signedDisplacement = -Math.sign(dy) * curvedMagnitude;
  const directionMultiplier = invertScroll ? -1 : 1;

  const rawWheelUnits = signedDisplacement * scrollGain * directionMultiplier + remainder;
  const integerDelta = Math.round(rawWheelUnits);
  const nextRemainder = rawWheelUnits - integerDelta;

  return {
    delta: integerDelta,
    remainder: nextRemainder
  };
}

/**
 * Clamps an accumulated scroll wheel delta to [-maxAbsDelta, +maxAbsDelta] (default +-1200).
 */
export function clampScrollDelta(
  delta: number,
  maxAbsDelta: number = MAX_SCROLL_REQUEST_DELTA
): number {
  if (!Number.isFinite(delta)) return 0;
  const limit = Math.max(1, Math.abs(Math.trunc(maxAbsDelta)));
  return Math.max(-limit, Math.min(limit, Math.round(delta)));
}
