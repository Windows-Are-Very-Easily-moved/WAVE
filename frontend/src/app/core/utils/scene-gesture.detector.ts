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
 * Heuristic to detect whether the thumb is tucked against or across the palm.
 *
 * Rationale:
 * In an open palm (high-five), the thumb is extended outward (abducted) away from the index
 * and middle MCPs (distance > 0.65 * handScale).
 * When tucked across the palm (for a 4-finger salute/scene gesture), the thumb tip is folded
 * inwards toward the palm center or base of the fingers (distance < 0.60 * handScale).
 * This prevents the 4-finger scene gesture from accidentally colliding with open-palm poses.
 */
export function isThumbTucked(landmarks: HandLandmarks): boolean {
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

  return thumbToMiddleMcp < handScale * 0.60 || thumbToIndexMcp < handScale * 0.50;
}

/**
 * Classifies raw hand landmarks into a Scene gesture finger count:
 * - 3: Index, middle, and ring fingers extended; pinky curled; thumb ignored.
 * - 4: Index, middle, ring, and pinky extended; thumb tucked across/against palm.
 * - null: Any other hand posture (e.g., open palm, pinch, fist, V-sign, point).
 */
export function classifyScenePose(landmarks: HandLandmarks | null): 3 | 4 | null {
  if (!landmarks || landmarks.length < 21) {
    return null;
  }

  const indexExt = isFingerExtended(landmarks, INDEX_TIP_LANDMARK, INDEX_PIP_LANDMARK);
  const middleExt = isFingerExtended(landmarks, MIDDLE_TIP_LANDMARK, MIDDLE_PIP_LANDMARK);
  const ringExt = isFingerExtended(landmarks, RING_TIP_LANDMARK, RING_PIP_LANDMARK);
  const pinkyExt = isFingerExtended(landmarks, PINKY_TIP_LANDMARK, PINKY_PIP_LANDMARK);

  // Both 3-finger and 4-finger require index, middle, and ring to be extended.
  if (!indexExt || !middleExt || !ringExt) {
    return null;
  }

  // 3-finger scene gesture: pinky must be curled down. Thumb is ignored.
  if (!pinkyExt) {
    return 3;
  }

  // 4-finger scene gesture: pinky is extended, but thumb MUST be tucked across the palm.
  // If thumb is open/abducted, this is an open palm (high-five) and must NOT trigger.
  if (isThumbTucked(landmarks)) {
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
 * Pure observer class that tracks 3-finger and 4-finger scene gestures over time.
 * Enforces steady hold duration, velocity limits, and post-trigger cooldowns without
 * altering the underlying gesture state machine.
 */
export class SceneGestureDetector {
  private activeFingers: 3 | 4 | null = null;
  private holdStartTimeMs = 0;
  private lastTriggerTimeMs = -Infinity;

  constructor(private options: SceneGestureDetectorOptions = {}) {}

  setOptions(options: Partial<SceneGestureDetectorOptions>): void {
    this.options = { ...this.options, ...options };
  }

  reset(): void {
    this.activeFingers = null;
    this.holdStartTimeMs = 0;
  }

  update(
    landmarks: HandLandmarks | null,
    engineState: GestureState,
    velocity: number,
    nowMs: number
  ): SceneGestureResult {
    const holdMs = this.options.holdMs ?? 600;
    const cooldownMs = this.options.cooldownMs ?? 1500;
    const maxVelocity = this.options.maxVelocity ?? 0.018;

    // Cooldown check
    const timeSinceLastTrigger = nowMs - this.lastTriggerTimeMs;
    const isCooldown = timeSinceLastTrigger < cooldownMs;

    // Must be in plain HOVER state (no active pinch, drag, or scroll in progress)
    if (engineState !== 'HOVER') {
      this.reset();
      return { fingers: null, progress: 0, triggered: false, cooldownActive: isCooldown };
    }

    // Hand must be relatively still
    if (velocity > maxVelocity) {
      this.reset();
      return { fingers: null, progress: 0, triggered: false, cooldownActive: isCooldown };
    }

    const detectedFingers = classifyScenePose(landmarks);
    if (detectedFingers === null) {
      this.reset();
      return { fingers: null, progress: 0, triggered: false, cooldownActive: isCooldown };
    }

    if (isCooldown) {
      this.reset();
      return { fingers: detectedFingers, progress: 0, triggered: false, cooldownActive: true };
    }

    // Pose maintained or changed
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
