import { Point2D, HandLandmarks } from './landmark.model';
import { SnapPosition } from './snap-action.model';

export type GestureState = 'IDLE' | 'HOVER' | 'GRABBING' | 'DRAGGING' | 'RELEASED';

export type FilterType = 'lerp' | 'oneEuro';

export interface ScepterSettings {
  pinchEnterThreshold: number;
  pinchExitMultiplier: number;
  lerpAlpha: number;
  filterType: FilterType;
  edgeZoneSize: number;
  dwellTimeMs: number;
  cooldownMs: number;
  dragDeadzone: number;
  trackingLossGraceMs: number;
  throwVelocityThreshold: number;
  enableCorners: boolean;
  enableThrowGesture: boolean;
  enableTwoHandResize: boolean;
  enableWaveCycleGesture: boolean;
  enableLiveDrag: boolean;
  snapRatio: number;
}

export const DEFAULT_SETTINGS: ScepterSettings = {
  pinchEnterThreshold: 0.28, // Normalized by wrist-to-middle-MCP hand size (~0.055 raw distance at arm's length)
  pinchExitMultiplier: 1.5,  // Hysteresis multiplier (exit threshold = enter * 1.5)
  lerpAlpha: 0.35,
  filterType: 'lerp',
  edgeZoneSize: 0.20,
  dwellTimeMs: 150,
  cooldownMs: 800,
  dragDeadzone: 0.025,
  trackingLossGraceMs: 300,
  throwVelocityThreshold: 2.35, // Normalized screen units per second
  enableCorners: true,
  enableThrowGesture: true,
  enableTwoHandResize: true,
  enableWaveCycleGesture: true,
  enableLiveDrag: true,
  snapRatio: 0.5
};

export interface GestureFrameSnapshot {
  state: GestureState;
  cursor: Point2D | null;
  rawCursor: Point2D | null;
  isPinching: boolean;
  normalizedPinchDistance: number;
  rawPinchDistance: number;
  pinchProgress: number; // 0 (open) -> 1 (closed/pinched)
  hoveredZone: SnapPosition | null;
  armedZone: SnapPosition | null;
  dwellProgress: number; // 0 -> 1
  velocity: number;
  handsMirrored: HandLandmarks[];
  grabIssued?: Point2D;
  moveIssued?: { x: number; y: number; deltaX: number; deltaY: number };
  snapIssued?: { position: SnapPosition; ratio: number };
  resizeIssued?: { scaleFactor: number };
  cycleIssued?: { direction: 'next' | 'prev' };
}

