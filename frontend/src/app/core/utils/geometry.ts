import { HandLandmarks, Landmark3D, Point2D } from '../models/landmark.model';

export const WRIST_LANDMARK = 0;
export const THUMB_TIP_LANDMARK = 4;
export const INDEX_TIP_LANDMARK = 8;
export const MIDDLE_MCP_LANDMARK = 9;

/**
 * Single authoritative place where webcam X coordinates are mirrored (flipped horizontally: x' = 1 - x).
 * Because a front-facing webcam acts like a mirror, flipping X here ensures moving your physical hand
 * to the right moves the spatial cursor to the right on screen.
 */
export function mirrorX(x: number): number {
  return 1.0 - x;
}

export function mirrorHandLandmarks(landmarks: HandLandmarks): HandLandmarks {
  return landmarks.map((lm) => ({
    x: mirrorX(lm.x),
    y: lm.y,
    z: lm.z
  }));
}

export function euclideanDistance2D(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function euclideanDistance3D(a: Landmark3D, b: Landmark3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z - b.z) * 0.35; // Weight Z slightly lower as monocular depth has higher variance
  return Math.hypot(dx, dy, dz);
}

export function midpoint2D(a: Point2D, b: Point2D): Point2D {
  return {
    x: (a.x + b.x) * 0.5,
    y: (a.y + b.y) * 0.5
  };
}

/**
 * Computes the pinch cursor point (midpoint between thumb tip #4 and index tip #8)
 * from already-mirrored hand landmarks, clamped to [0..1].
 */
export function computePinchCursor(mirroredHand: HandLandmarks): Point2D {
  const thumb = mirroredHand[THUMB_TIP_LANDMARK];
  const index = mirroredHand[INDEX_TIP_LANDMARK];
  const mid = midpoint2D(thumb, index);
  return {
    x: Math.max(0, Math.min(1, mid.x)),
    y: Math.max(0, Math.min(1, mid.y))
  };
}

/**
 * Computes both the raw Euclidean distance between thumb tip (#4) and index tip (#8)
 * and the hand-size-normalized pinch ratio (divided by wrist #0 to middle-finger MCP #9 distance).
 *
 * At typical arm's-length distance, wrist-to-middle-MCP is ~0.20 in normalized camera space,
 * so a normalized threshold of 0.28 corresponds to ~0.055 raw distance while staying invariant
 * when the user leans closer or further from the webcam.
 */
export function computePinchMetrics(mirroredHand: HandLandmarks): {
  rawDistance: number;
  handScale: number;
  normalizedDistance: number;
} {
  const thumb = mirroredHand[THUMB_TIP_LANDMARK];
  const index = mirroredHand[INDEX_TIP_LANDMARK];
  const wrist = mirroredHand[WRIST_LANDMARK];
  const middleMcp = mirroredHand[MIDDLE_MCP_LANDMARK];

  const rawDistance = euclideanDistance2D(thumb, index);
  const handScale = Math.max(euclideanDistance2D(wrist, middleMcp), 0.05);
  const normalizedDistance = rawDistance / handScale;

  return { rawDistance, handScale, normalizedDistance };
}

