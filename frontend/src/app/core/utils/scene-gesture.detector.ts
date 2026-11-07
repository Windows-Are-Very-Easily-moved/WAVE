import { HandLandmarks } from '../models/landmark.model';
import { GestureState } from '../models/gesture.model';
import {
  INDEX_PIP_LANDMARK,
  MIDDLE_PIP_LANDMARK,
  MIDDLE_TIP_LANDMARK,
  PINKY_PIP_LANDMARK,
  PINKY_TIP_LANDMARK,
  RING_PIP_LANDMARK,
  RING_TIP_LANDMARK,
  isFingerExtended
} from './pose';
import {
  INDEX_TIP_LANDMARK,
  MIDDLE_MCP_LANDMARK,
  THUMB_TIP_LANDMARK,
  WRIST_LANDMARK,
  euclideanDistance2D
} from './geometry';

export const THUMB_MCP_LANDMARK = 2;
export const INDEX_MCP_LANDMARK = 5;
export const PINKY_MCP_LANDMARK = 17;

/**
 * Checks whether the thumb is extended outward away from the palm (as in Shaka 🤙 or open hand).
 */
export function isThumbExtendedOutward(landmarks: HandLandmarks): boolean {
  if (!landmarks || landmarks.length < 21) {
    return false;
  }

  const wrist = landmarks[WRIST_LANDMARK];
  const middleMcp = landmarks[MIDDLE_MCP_LANDMARK];
  const thumbTip = landmarks[THUMB_TIP_LANDMARK];
  const indexMcp = landmarks[INDEX_MCP_LANDMARK];

  if (!wrist || !middleMcp || !thumbTip || !indexMcp) {
    return false;
  }

  const handScale = Math.max(euclideanDistance2D(wrist, middleMcp), 0.05);
  const thumbToMiddleMcp = euclideanDistance2D(thumbTip, middleMcp);
  const thumbToIndexMcp = euclideanDistance2D(thumbTip, indexMcp);

  return thumbToMiddleMcp >= handScale * 0.62 && thumbToIndexMcp >= handScale * 0.48;
}

/**
 * Legacy helper preserved for backward compatibility with unit tests:
 * returns true when thumb is folded inward toward the palm.
 */
export function isThumbTucked(landmarks: HandLandmarks): boolean {
  if (!landmarks || landmarks.length < 21) {
    return false;
  }
  return !isThumbExtendedOutward(landmarks);
}

/**
 * Classifies raw hand landmarks into an orthogonal Scene gesture slot (`3` or `4`)
 * that NEVER collides with Pinch-Grab, V-Sign Scroll, or Open-Palm Window Switch:
 *
 * - Slot `3` (🤘 Rock-On Sign):
 *   Index (#8) AND Pinky (#20) are extended; Middle (#12) AND Ring (#16) are curled down!
 *   Also verifies thumb (#4) is not pinching index (#8).
 *
 * - Slot `4` (🤙 Shaka / Call-Me Sign):
 *   Thumb (#4) AND Pinky (#20) are extended outward; Index (#8), Middle (#12), AND Ring (#16) are curled down!
 *
 * Why zero interference:
 * - Both signs require Middle AND Ring fingers to be curled down, so an open hand (hover/swipe)
 *   never matches.
 * - Both signs require Pinky to be extended AND Middle to be curled, so V-sign scroll (Index+Middle up, Pinky curled)
 *   never matches.
 * - Pinching thumb + index never matches either sign.
 */
export function classifyScenePose(landmarks: HandLandmarks | null): 3 | 4 | null {
  if (!landmarks || landmarks.length < 21) {
    return null;
  }

  const indexExt = isFingerExtended(landmarks, INDEX_TIP_LANDMARK, INDEX_PIP_LANDMARK);
  const middleExt = isFingerExtended(landmarks, MIDDLE_TIP_LANDMARK, MIDDLE_PIP_LANDMARK);
  const ringExt = isFingerExtended(landmarks, RING_TIP_LANDMARK, RING_PIP_LANDMARK);
  const pinkyExt = isFingerExtended(landmarks, PINKY_TIP_LANDMARK, PINKY_PIP_LANDMARK);

  // Both orthogonal scene signs (🤘 Rock-On and 🤙 Shaka) require:
  // 1. Pinky extended
  // 2. Middle and Ring curled down
  if (!pinkyExt || middleExt || ringExt) {
    return null;
  }

  const wrist = landmarks[WRIST_LANDMARK];
  const middleMcp = landmarks[MIDDLE_MCP_LANDMARK];
  const thumbTip = landmarks[THUMB_TIP_LANDMARK];
  const indexTip = landmarks[INDEX_TIP_LANDMARK];
  const handScale = Math.max(euclideanDistance2D(wrist, middleMcp), 0.05);

  // Guard: if thumb tip and index tip are pinched together, this is a Pinch-Grab, NOT a scene sign!
  const pinchDistNorm = euclideanDistance2D(thumbTip, indexTip) / handScale;
  if (pinchDistNorm <= 0.35) {
    return null;
  }

  // Slot 3 -> 🤘 Rock-On: Index extended + Pinky extended (Middle & Ring curled)
  if (indexExt) {
    return 3;
  }

  // Slot 4 -> 🤙 Shaka: Index curled + Pinky extended + Thumb extended outward (Middle & Ring curled)
  if (!indexExt && isThumbExtendedOutward(landmarks)) {
    return 4;
  }

  return null;
}

export interface SceneGestureResult {
  fingers: 3 | 4 | null;
  progress: number;
  triggered: boolean;
  cooldownActive: boolean;
}

export interface SceneGestureDetectorOptions {
  holdMs?: number;
  cooldownMs?: number;
  maxVelocity?: number;
}

/**
 * Pure observer class that tracks Rock-On (slot 3) and Shaka (slot 4) scene gestures over time.
 * Enforces steady hold duration, velocity limits, and post-trigger cooldowns without
 * altering or interfering with the underlying gesture state machine.
 */
export class SceneGestureDetector {
  private activeFingers: 3 | 4 | null = null;
  private holdStartTimeMs = 0;
  private lastValidPoseTimeMs = -Infinity;
  private lastTriggerTimeMs = -Infinity;

  constructor(private options: SceneGestureDetectorOptions = {}) {}

  setOptions(options: Partial<SceneGestureDetectorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  reset(): void {
    this.activeFingers = null;
    this.holdStartTimeMs = 0;
    this.lastValidPoseTimeMs = -Infinity;
  }

  update(
    landmarks: HandLandmarks | null,
    engineState: GestureState,
    velocity: number,
    nowMs: number
  ): SceneGestureResult {
    const holdMs = this.options.holdMs ?? 600;
    const cooldownMs = this.options.cooldownMs ?? 1500;
    const maxVelocity = this.options.maxVelocity ?? 1.8;

    const timeSinceLastTrigger = nowMs - this.lastTriggerTimeMs;
    const isCooldown = timeSinceLastTrigger < cooldownMs;

    // Only observe when in plain HOVER state (never interfere with GRABBING, DRAGGING, or SCROLLING)
    if (engineState !== 'HOVER') {
      this.reset();
      return { fingers: null, progress: 0, triggered: false, cooldownActive: isCooldown };
    }

    if (velocity > maxVelocity) {
      this.reset();
      return { fingers: null, progress: 0, triggered: false, cooldownActive: isCooldown };
    }

    const detectedFingers = classifyScenePose(landmarks);
    if (detectedFingers === null) {
      if (this.activeFingers !== null && nowMs - this.lastValidPoseTimeMs <= 120 && !isCooldown) {
        const elapsed = nowMs - this.holdStartTimeMs;
        const progress = Math.min(0.99, elapsed / Math.max(1, holdMs));
        return { fingers: this.activeFingers, progress, triggered: false, cooldownActive: false };
      }
      this.reset();
      return { fingers: null, progress: 0, triggered: false, cooldownActive: isCooldown };
    }

    this.lastValidPoseTimeMs = nowMs;

    if (isCooldown) {
      this.reset();
      return { fingers: detectedFingers, progress: 0, triggered: false, cooldownActive: true };
    }

    if (this.activeFingers !== detectedFingers) {
      this.activeFingers = detectedFingers;
      this.holdStartTimeMs = nowMs;
      return { fingers: detectedFingers, progress: 0, triggered: false, cooldownActive: false };
    }

    const elapsed = nowMs - this.holdStartTimeMs;
    const progress = Math.min(1.0, elapsed / Math.max(1, holdMs));

    if (progress >= 1.0) {
      this.lastTriggerTimeMs = nowMs;
      this.reset();
      return { fingers: detectedFingers, progress: 1.0, triggered: true, cooldownActive: false };
    }

    return { fingers: detectedFingers, progress, triggered: false, cooldownActive: false };
  }
}
