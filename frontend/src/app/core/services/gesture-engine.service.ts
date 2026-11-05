import { Injectable } from '@angular/core';
import {
  DEFAULT_SETTINGS,
  FilterType,
  GestureFrameSnapshot,
  GestureState,
  ScepterSettings
} from '../models/gesture.model';
import { HandLandmarks, Point2D } from '../models/landmark.model';
import { SnapPosition } from '../models/snap-action.model';
import {
  computePinchCursor,
  computePinchMetrics,
  euclideanDistance2D,
  mirrorHandLandmarks
} from '../utils/geometry';
import { LerpFilter2D, OneEuroFilter2D, PointFilter2D } from '../utils/lerp';

/**
 * Explicit, pure, unit-testable state machine for spatial hand gestures:
 * IDLE -> HOVER (hand visible) -> GRABBING (pinch held) -> DRAGGING (moved past deadzone) -> RELEASED.
 *
 * Includes:
 * - Hand-size-normalized pinch detection with hysteresis (enter vs exit threshold)
 * - Pluggable 2D cursor smoothing (Lerp or One Euro filter) applied BEFORE edge-zone checks
 * - Edge-zone dwell timer (~150ms default) before a zone is armed
 * - Release snap debounce/cooldown (~800ms default)
 * - Tracking-loss tolerance (~300ms grace window during an active grab)
 * - Stretch goals: flick/throw velocity detection (`nextMonitor`) and two-hand pinch proportional resize
 */
export class GestureStateMachine {
  private state: GestureState = 'IDLE';
  private isPinching = false;
  private grabOrigin: Point2D | null = null;
  private lastSmoothedCursor: Point2D | null = null;
  private lastCursorTimestampMs: number | null = null;
  private lastHandSeenTimestampMs: number | null = null;

  private hoveredZone: SnapPosition | null = null;
  private hoverZoneEnteredAtMs: number | null = null;
  private armedZone: SnapPosition | null = null;

  private lastSnapTimestampMs = -Infinity;
  private lastResizeTimestampMs = -Infinity;
  private lastCycleTimestampMs = -Infinity;
  private lastPinchReleaseTimestampMs = -Infinity;
  private lastMoveTimestampMs = -Infinity;
  private lastMoveCursor: Point2D | null = null;
  private initialTwoHandDistance: number | null = null;
  private hoverSwipeHistory: { x: number; y: number; t: number }[] = [];

  private lerpFilter: LerpFilter2D;
  private oneEuroFilter: OneEuroFilter2D;
  private activeFilterType: FilterType;

  constructor(private settings: ScepterSettings = { ...DEFAULT_SETTINGS }) {
    this.lerpFilter = new LerpFilter2D(this.settings.lerpAlpha);
    this.oneEuroFilter = new OneEuroFilter2D();
    this.activeFilterType = this.settings.filterType;
  }

  updateSettings(newSettings: ScepterSettings): void {
    this.settings = { ...newSettings };
    this.lerpFilter.setAlpha(this.settings.lerpAlpha);
    if (this.activeFilterType !== this.settings.filterType) {
      this.activeFilterType = this.settings.filterType;
      this.getActiveFilter().reset();
    }
  }

  getState(): GestureState {
    return this.state;
  }

  reset(): void {
    this.state = 'IDLE';
    this.isPinching = false;
    this.grabOrigin = null;
    this.lastSmoothedCursor = null;
    this.lastCursorTimestampMs = null;
    this.lastHandSeenTimestampMs = null;
    this.hoveredZone = null;
    this.hoverZoneEnteredAtMs = null;
    this.armedZone = null;
    this.initialTwoHandDistance = null;
    this.lastMoveCursor = null;
    this.hoverSwipeHistory = [];
    this.lerpFilter.reset();
    this.oneEuroFilter.reset();
  }

  /**
   * Process a frame of raw (unmirrored) MediaPipe hand landmarks.
   * Mirroring is performed once right here via `mirrorHandLandmarks`.
   */
  processLandmarks(rawHands: HandLandmarks[], timestampMs: number): GestureFrameSnapshot {
    if (!rawHands || rawHands.length === 0 || rawHands[0].length < 21) {
      return this.handleMissingHand(timestampMs);
    }

    const mirroredHands = rawHands.map((h) => mirrorHandLandmarks(h));
    const primaryHand = mirroredHands[0];
    const rawCursor = computePinchCursor(primaryHand);
    const { rawDistance, normalizedDistance } = computePinchMetrics(primaryHand);

    // Optional stretch goal: two-hand simultaneous pinch resize
    let resizeIssued: { scaleFactor: number } | undefined;
    let isTwoHandActive = false;
    if (this.settings.enableTwoHandResize && mirroredHands.length >= 2 && mirroredHands[1].length >= 21) {
      const secondHand = mirroredHands[1];
      const secondMetrics = computePinchMetrics(secondHand);
      const secondCursor = computePinchCursor(secondHand);
      const bothPinching =
        normalizedDistance < this.settings.pinchEnterThreshold * this.settings.pinchExitMultiplier &&
        secondMetrics.normalizedDistance < this.settings.pinchEnterThreshold * this.settings.pinchExitMultiplier;

      if (bothPinching) {
        isTwoHandActive = true;
        const span = Math.max(euclideanDistance2D(rawCursor, secondCursor), 0.05);
        if (this.initialTwoHandDistance === null) {
          this.initialTwoHandDistance = span;
        } else if (timestampMs - this.lastResizeTimestampMs >= 350) {
          const ratio = span / this.initialTwoHandDistance;
          if (Math.abs(ratio - 1.0) >= 0.18) {
            resizeIssued = { scaleFactor: Math.max(0.5, Math.min(1.8, ratio)) };
            this.initialTwoHandDistance = span;
            this.lastResizeTimestampMs = timestampMs;
          }
        }
      } else {
        this.initialTwoHandDistance = null;
      }
    } else {
      this.initialTwoHandDistance = null;
    }

    const snapshot = this.processInput(
      rawCursor,
      normalizedDistance,
      rawDistance,
      timestampMs,
      mirroredHands,
      isTwoHandActive
    );

    if (resizeIssued) {
      snapshot.resizeIssued = resizeIssued;
    }

    return snapshot;
  }

  /**
   * Process synthetic mouse/pointer input for Demo/Simulation mode using the exact same state machine.
   */
  processPointerSimulation(
    cursor: Point2D | null,
    isMouseDown: boolean,
    timestampMs: number
  ): GestureFrameSnapshot {
    if (!cursor) {
      return this.handleMissingHand(timestampMs);
    }

    // When mouse button is down, feed a normalized pinch distance well below enter threshold (0.08).
    // When mouse button is up, feed an open-hand distance well above exit threshold (0.65).
    const simulatedNormalizedDistance = isMouseDown ? 0.08 : 0.65;
    const simulatedRawDistance = isMouseDown ? 0.016 : 0.13;

    return this.processInput(
      {
        x: Math.max(0, Math.min(1, cursor.x)),
        y: Math.max(0, Math.min(1, cursor.y))
      },
      simulatedNormalizedDistance,
      simulatedRawDistance,
      timestampMs,
      []
    );
  }

  private processInput(
    rawCursor: Point2D,
    normalizedPinchDistance: number,
    rawPinchDistance: number,
    timestampMs: number,
    handsMirrored: HandLandmarks[],
    isTwoHandActive = false
  ): GestureFrameSnapshot {
    this.lastHandSeenTimestampMs = timestampMs;

    // 1. Apply smoothing filter BEFORE any edge-zone or deadzone evaluation
    const filter = this.getActiveFilter();
    const smoothedCursor = filter.filter(rawCursor, timestampMs);

    // Compute instantaneous cursor velocity (normalized units/sec)
    let velocity = 0;
    if (
      this.lastSmoothedCursor &&
      this.lastCursorTimestampMs !== null &&
      timestampMs > this.lastCursorTimestampMs
    ) {
      const dtSec = Math.max((timestampMs - this.lastCursorTimestampMs) / 1000.0, 0.004);
      velocity = euclideanDistance2D(smoothedCursor, this.lastSmoothedCursor) / dtSec;
    }
    this.lastSmoothedCursor = smoothedCursor;
    this.lastCursorTimestampMs = timestampMs;

    // 2. Hysteresis pinch detection
    const enterThreshold = this.settings.pinchEnterThreshold;
    const exitThreshold = enterThreshold * this.settings.pinchExitMultiplier;

    const wasPinching = this.isPinching;
    if (!this.isPinching) {
      if (normalizedPinchDistance <= enterThreshold) {
        this.isPinching = true;
      }
    } else {
      if (normalizedPinchDistance >= exitThreshold) {
        this.isPinching = false;
      }
    }

    // Visual pinch closeness progress [0..1]
    const openRef = exitThreshold * 1.35;
    const pinchProgress = Math.max(
      0,
      Math.min(1, (openRef - normalizedPinchDistance) / Math.max(openRef - enterThreshold, 0.01))
    );

    // 3. Evaluate edge zone at smoothed cursor
    const zoneAtCursor = this.evaluateEdgeZone(smoothedCursor);
    let dwellProgress = 0;

    let grabIssued: Point2D | undefined;
    let moveIssued: { x: number; y: number; deltaX: number; deltaY: number } | undefined;
    let snapIssued: { position: SnapPosition; ratio: number } | undefined;
    let cycleIssued: { direction: 'next' | 'prev' } | undefined;

    // If transitioning out of RELEASED on the next frame, settle into HOVER or GRABBING
    if (this.state === 'RELEASED') {
      this.state = 'HOVER';
    }

    if (this.isPinching) {
      this.hoverSwipeHistory = [];
      if (!wasPinching || (this.state !== 'GRABBING' && this.state !== 'DRAGGING')) {
        // Transition -> GRABBING
        this.state = 'GRABBING';
        this.grabOrigin = { ...smoothedCursor };
        this.hoveredZone = null;
        this.hoverZoneEnteredAtMs = null;
        this.armedZone = null;
        this.lastMoveCursor = { ...smoothedCursor };
        grabIssued = { ...smoothedCursor };
      } else if (this.state === 'GRABBING') {
        const distFromGrab = this.grabOrigin
          ? euclideanDistance2D(smoothedCursor, this.grabOrigin)
          : 0;
        if (distFromGrab >= this.settings.dragDeadzone) {
          this.state = 'DRAGGING';
        }
      }

      // Live spatial dragging: stream movement deltas while in DRAGGING state,
      // BUT only when NOT in a snap zone and NOT actively resizing with two hands
      if (this.state === 'DRAGGING' && this.settings.enableLiveDrag && !zoneAtCursor && !isTwoHandActive) {
        if (!this.lastMoveCursor) {
          this.lastMoveCursor = { ...smoothedCursor };
        } else if (timestampMs - this.lastMoveTimestampMs >= 32) { // smooth ~30 FPS stream
          const deltaX = smoothedCursor.x - this.lastMoveCursor.x;
          const deltaY = smoothedCursor.y - this.lastMoveCursor.y;
          if (Math.abs(deltaX) > 0.002 || Math.abs(deltaY) > 0.002) {
            moveIssued = {
              x: smoothedCursor.x,
              y: smoothedCursor.y,
              deltaX,
              deltaY
            };
            this.lastMoveCursor = { ...smoothedCursor };
            this.lastMoveTimestampMs = timestampMs;
          }
        }
      } else {
        // Reset last move point when hovering in a snap zone so leaving the zone is seamless
        this.lastMoveCursor = { ...smoothedCursor };
      }

      // While grabbing or dragging, track edge-zone dwell
      if (this.state === 'DRAGGING' || this.state === 'GRABBING') {
        if (zoneAtCursor) {
          if (this.hoveredZone !== zoneAtCursor) {
            this.hoveredZone = zoneAtCursor;
            this.hoverZoneEnteredAtMs = timestampMs;
            this.armedZone = null;
          } else if (this.hoverZoneEnteredAtMs !== null) {
            const elapsed = timestampMs - this.hoverZoneEnteredAtMs;
            dwellProgress = Math.min(1, elapsed / Math.max(this.settings.dwellTimeMs, 1));
            if (elapsed >= this.settings.dwellTimeMs) {
              this.armedZone = zoneAtCursor;
            }
          }
        } else {
          this.hoveredZone = null;
          this.hoverZoneEnteredAtMs = null;
          this.armedZone = null;
        }
      }
    } else {
      // Not pinching
      if (wasPinching && (this.state === 'GRABBING' || this.state === 'DRABBING' as any || this.state === 'DRAGGING')) {
        // Pinch just released!
        this.state = 'RELEASED';

        const cooldownReady = timestampMs - this.lastSnapTimestampMs >= this.settings.cooldownMs;

        if (cooldownReady) {
          if (this.armedZone) {
            snapIssued = {
              position: this.armedZone,
              ratio: this.settings.snapRatio
            };
            this.lastSnapTimestampMs = timestampMs;
          } else if (
            this.settings.enableThrowGesture &&
            this.state === 'RELEASED' &&
            velocity >= this.settings.throwVelocityThreshold
          ) {
            snapIssued = {
              position: 'nextMonitor',
              ratio: 1.0
            };
            this.lastSnapTimestampMs = timestampMs;
          }
        }

        this.grabOrigin = null;
        this.hoveredZone = null;
        this.hoverZoneEnteredAtMs = null;
        this.armedZone = null;
        this.lastMoveCursor = null;
        this.lastPinchReleaseTimestampMs = timestampMs;
        this.hoverSwipeHistory = [];
      } else {
        this.state = 'HOVER';
        this.hoveredZone = zoneAtCursor;
        this.hoverZoneEnteredAtMs = null;
        this.armedZone = null;

        // Open-hand vertical up/down swipe gesture in HOVER state to cycle windows (Virtual Alt+Tab)
        // Because palm stays flat facing the webcam during an up/down motion, thumb (#4) and index (#8)
        // never foreshorten or overlap, avoiding false pinch triggers!
        if (
          this.settings.enableWaveCycleGesture &&
          timestampMs - this.lastPinchReleaseTimestampMs >= 450
        ) {
          const swipePoint = handsMirrored.length > 0 && handsMirrored[0][9]
            ? handsMirrored[0][9] // Middle-finger MCP (palm center)
            : rawCursor;

          this.hoverSwipeHistory.push({ x: swipePoint.x, y: swipePoint.y, t: timestampMs });
          const windowCutoff = timestampMs - 380;
          while (this.hoverSwipeHistory.length > 0 && this.hoverSwipeHistory[0].t < windowCutoff) {
            this.hoverSwipeHistory.shift();
          }

          if (
            this.hoverSwipeHistory.length >= 3 &&
            timestampMs - this.lastCycleTimestampMs >= 850 &&
            timestampMs - this.lastSnapTimestampMs >= 650
          ) {
            // Find the lowest (largest y) sample in the recent 380ms window to measure upward travel
            let lowestSample = this.hoverSwipeHistory[0];
            for (const sample of this.hoverSwipeHistory) {
              if (sample.y > lowestSample.y) {
                lowestSample = sample;
              }
            }

            const dx = swipePoint.x - lowestSample.x;
            const dy = swipePoint.y - lowestSample.y; // Negative when swiping UP (screen Y=0 is top)
            const dtSec = Math.max((timestampMs - lowestSample.t) / 1000.0, 0.04);
            const vy = Math.abs(dy) / dtSec;

            // Only trigger on an UPWARD swipe (dy <= -0.18) so lowering the hand back down never reverses the cycle!
            if (dy <= -0.18 && Math.abs(dx) <= Math.abs(dy) * 0.85 && vy >= 0.65) {
              cycleIssued = { direction: 'next' };
              this.lastCycleTimestampMs = timestampMs;
              this.hoverSwipeHistory = [];
            }
          }
        } else {
          this.hoverSwipeHistory = [];
        }
      }
    }

    return {
      state: this.state,
      cursor: smoothedCursor,
      rawCursor,
      isPinching: this.isPinching,
      normalizedPinchDistance,
      rawPinchDistance,
      pinchProgress,
      hoveredZone: this.hoveredZone,
      armedZone: this.armedZone,
      dwellProgress,
      velocity,
      handsMirrored,
      grabIssued,
      moveIssued,
      snapIssued,
      cycleIssued
    };
  }

  private handleMissingHand(timestampMs: number): GestureFrameSnapshot {
    // Tolerate brief tracking loss (<300ms default) during an active grab
    if (
      (this.state === 'GRABBING' || this.state === 'DRAGGING') &&
      this.lastHandSeenTimestampMs !== null &&
      timestampMs - this.lastHandSeenTimestampMs <= this.settings.trackingLossGraceMs
    ) {
      return {
        state: this.state,
        cursor: this.lastSmoothedCursor,
        rawCursor: this.lastSmoothedCursor,
        isPinching: this.isPinching,
        normalizedPinchDistance: 0,
        rawPinchDistance: 0,
        pinchProgress: 1,
        hoveredZone: this.hoveredZone,
        armedZone: this.armedZone,
        dwellProgress: this.armedZone ? 1 : 0,
        velocity: 0,
        handsMirrored: []
      };
    }

    // Grace period expired or no active grab -> cancel grab and return to IDLE
    this.reset();
    return {
      state: 'IDLE',
      cursor: null,
      rawCursor: null,
      isPinching: false,
      normalizedPinchDistance: 1,
      rawPinchDistance: 1,
      pinchProgress: 0,
      hoveredZone: null,
      armedZone: null,
      dwellProgress: 0,
      velocity: 0,
      handsMirrored: []
    };
  }

  evaluateEdgeZone(cursor: Point2D): SnapPosition | null {
    const z = this.settings.edgeZoneSize;
    const isLeft = cursor.x < z;
    const isRight = cursor.x > 1.0 - z;
    const isTop = cursor.y < z;
    const isBottom = cursor.y > 1.0 - z;

    if (this.settings.enableCorners) {
      if (isLeft && isTop) return 'topLeft';
      if (isRight && isTop) return 'topRight';
      if (isLeft && isBottom) return 'bottomLeft';
      if (isRight && isBottom) return 'bottomRight';
    }

    if (isLeft) return 'left';
    if (isRight) return 'right';
    if (isTop) return 'top';

    return null;
  }

  private getActiveFilter(): PointFilter2D {
    return this.activeFilterType === 'oneEuro' ? this.oneEuroFilter : this.lerpFilter;
  }
}

@Injectable({ providedIn: 'root' })
export class GestureEngineService {
  private readonly machine = new GestureStateMachine();

  updateSettings(settings: ScepterSettings): void {
    this.machine.updateSettings(settings);
  }

  processLandmarks(rawHands: HandLandmarks[], timestampMs: number): GestureFrameSnapshot {
    return this.machine.processLandmarks(rawHands, timestampMs);
  }

  processPointerSimulation(
    cursor: Point2D | null,
    isMouseDown: boolean,
    timestampMs: number
  ): GestureFrameSnapshot {
    return this.machine.processPointerSimulation(cursor, isMouseDown, timestampMs);
  }

  reset(): void {
    this.machine.reset();
  }
}

