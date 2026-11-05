import { Injectable } from '@angular/core';
import {
  DEFAULT_SETTINGS,
  FilterType,
  GestureFrameSnapshot,
  GestureState,
  ScepterSettings
} from '../models/gesture.model';
import { HandLandmarks, Point2D } from '../models/landmark.model';
import { ScrollPayload, SnapPosition } from '../models/snap-action.model';
import {
  computePinchCursor,
  computePinchMetrics,
  euclideanDistance2D,
  mirrorHandLandmarks
} from '../utils/geometry';
import { LerpFilter2D, OneEuroFilter2D, PointFilter2D } from '../utils/lerp';
import {
  clampScrollDelta,
  computeScrollDeltaStep,
  computeVSignCursor,
  isVSign
} from '../utils/pose';

/** Minimum interval (~30 requests/sec) between batched scroll delta requests. */
const SCROLL_BATCH_INTERVAL_MS = 33;

/**
 * Explicit, pure, unit-testable state machine for spatial hand gestures:
 * IDLE -> HOVER (hand visible) -> GRABBING (pinch held) -> DRAGGING (moved past deadzone) -> RELEASED
 *      -> SCROLLING (V-sign held for scrollEnterMs while not pinching).
 *
 * Includes:
 * - Hand-size-normalized pinch detection with hysteresis (enter vs exit threshold)
 * - Orientation-independent V-sign (peace sign) pose detection & relative vertical wheel scrolling
 * - Pinch priority: pinching always preempts or exits SCROLLING immediately
 * - Pluggable 2D cursor smoothing (Lerp or One Euro filter) applied BEFORE edge-zone or scroll checks
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

  // V-sign scroll state tracking
  private vSignEnteredAtMs: number | null = null;
  private vSignLostAtMs: number | null = null;
  private prevScrollSmoothedY: number | null = null;
  private scrollRemainder = 0;
  private accumulatedScrollDelta = 0;
  private latchedScrollDelta = 0;
  private lastScrollDeltaEmitTimestampMs = -Infinity;
  private lastVisualScrollDelta = 0;

  private lerpFilter: LerpFilter2D;
  private oneEuroFilter: OneEuroFilter2D;
  private scrollLerpFilter: LerpFilter2D;
  private scrollOneEuroFilter: OneEuroFilter2D;
  private activeFilterType: FilterType;

  constructor(private settings: ScepterSettings = { ...DEFAULT_SETTINGS }) {
    this.lerpFilter = new LerpFilter2D(this.settings.lerpAlpha);
    this.oneEuroFilter = new OneEuroFilter2D();
    this.scrollLerpFilter = new LerpFilter2D(this.settings.lerpAlpha);
    this.scrollOneEuroFilter = new OneEuroFilter2D();
    this.activeFilterType = this.settings.filterType;
  }

  updateSettings(newSettings: ScepterSettings): void {
    this.settings = { ...DEFAULT_SETTINGS, ...newSettings };
    this.lerpFilter.setAlpha(this.settings.lerpAlpha);
    this.scrollLerpFilter.setAlpha(this.settings.lerpAlpha);
    if (this.activeFilterType !== this.settings.filterType) {
      this.activeFilterType = this.settings.filterType;
      this.getActiveFilter().reset();
      this.getActiveScrollFilter().reset();
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
    this.clearScrollTracking();
    this.lerpFilter.reset();
    this.oneEuroFilter.reset();
  }

  private clearScrollTracking(): void {
    this.vSignEnteredAtMs = null;
    this.vSignLostAtMs = null;
    this.prevScrollSmoothedY = null;
    this.scrollRemainder = 0;
    this.accumulatedScrollDelta = 0;
    this.latchedScrollDelta = 0;
    this.lastScrollDeltaEmitTimestampMs = -Infinity;
    this.lastVisualScrollDelta = 0;
    this.scrollLerpFilter?.reset();
    this.scrollOneEuroFilter?.reset();
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

    const vSignDetected =
      this.settings.scrollEnabled &&
      isVSign(primaryHand, { vSpreadMin: this.settings.vSpreadMin });
    const rawScrollCursor = computeVSignCursor(primaryHand);

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
      isTwoHandActive,
      vSignDetected,
      rawScrollCursor
    );

    if (resizeIssued) {
      snapshot.resizeIssued = resizeIssued;
    }

    return snapshot;
  }

  /**
   * Process synthetic mouse/pointer input for Demo/Simulation mode using the exact same state machine.
   * Holding Shift while moving the mouse emulates a V-sign scroll gesture.
   */
  processPointerSimulation(
    cursor: Point2D | null,
    isMouseDown: boolean,
    timestampMs: number,
    isShiftDown: boolean = false
  ): GestureFrameSnapshot {
    if (!cursor) {
      return this.handleMissingHand(timestampMs);
    }

    // When mouse button is down, feed a normalized pinch distance well below enter threshold (0.08).
    // When mouse button is up, feed an open-hand distance well above exit threshold (0.65).
    const simulatedNormalizedDistance = isMouseDown ? 0.08 : 0.65;
    const simulatedRawDistance = isMouseDown ? 0.016 : 0.13;
    const clampedCursor: Point2D = {
      x: Math.max(0, Math.min(1, cursor.x)),
      y: Math.max(0, Math.min(1, cursor.y))
    };

    const simulatedVSign = Boolean(isShiftDown && !isMouseDown && this.settings.scrollEnabled);

    return this.processInput(
      clampedCursor,
      simulatedNormalizedDistance,
      simulatedRawDistance,
      timestampMs,
      [],
      false,
      simulatedVSign,
      clampedCursor
    );
  }

  private processInput(
    rawCursor: Point2D,
    normalizedPinchDistance: number,
    rawPinchDistance: number,
    timestampMs: number,
    handsMirrored: HandLandmarks[],
    isTwoHandActive = false,
    vSignDetected = false,
    rawScrollCursor: Point2D = rawCursor
  ): GestureFrameSnapshot {
    this.lastHandSeenTimestampMs = timestampMs;

    // 1. Apply smoothing filter BEFORE any edge-zone or deadzone evaluation
    const filter = this.getActiveFilter();
    const smoothedPinchCursor = filter.filter(rawCursor, timestampMs);

    // Compute instantaneous cursor velocity (normalized units/sec)
    let velocity = 0;
    if (
      this.lastSmoothedCursor &&
      this.lastCursorTimestampMs !== null &&
      timestampMs > this.lastCursorTimestampMs
    ) {
      const dtSec = Math.max((timestampMs - this.lastCursorTimestampMs) / 1000.0, 0.004);
      velocity = euclideanDistance2D(smoothedPinchCursor, this.lastSmoothedCursor) / dtSec;
    }
    this.lastSmoothedCursor = smoothedPinchCursor;
    this.lastCursorTimestampMs = timestampMs;

    // 2. Hysteresis pinch detection (Pinch always wins over scrolling)
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
    const zoneAtCursor = this.evaluateEdgeZone(smoothedPinchCursor);
    let dwellProgress = 0;

    let grabIssued: Point2D | undefined;
    let moveIssued: { x: number; y: number; deltaX: number; deltaY: number } | undefined;
    let snapIssued: { position: SnapPosition; ratio: number } | undefined;
    let cycleIssued: { direction: 'next' | 'prev' } | undefined;
    let scrollIssued: ScrollPayload | undefined;

    let activeCursor: Point2D = smoothedPinchCursor;
    let activeRawCursor: Point2D = rawCursor;

    // If transitioning out of RELEASED on the next frame, settle into HOVER
    if (this.state === 'RELEASED') {
      this.state = 'HOVER';
    }

    if (this.isPinching) {
      // Pinch always wins: cancel any active or pending scroll state immediately
      this.clearScrollTracking();
      this.hoverSwipeHistory = [];

      if (!wasPinching || (this.state !== 'GRABBING' && this.state !== 'DRAGGING')) {
        // Transition -> GRABBING
        this.state = 'GRABBING';
        this.grabOrigin = { ...smoothedPinchCursor };
        this.hoveredZone = null;
        this.hoverZoneEnteredAtMs = null;
        this.armedZone = null;
        this.lastMoveCursor = { ...smoothedPinchCursor };
        grabIssued = { ...smoothedPinchCursor };
      } else if (this.state === 'GRABBING') {
        const distFromGrab = this.grabOrigin
          ? euclideanDistance2D(smoothedPinchCursor, this.grabOrigin)
          : 0;
        if (distFromGrab >= this.settings.dragDeadzone) {
          this.state = 'DRAGGING';
        }
      }

      // Live spatial dragging: stream movement deltas while in DRAGGING state,
      // BUT only when NOT in a snap zone and NOT actively resizing with two hands
      if (this.state === 'DRAGGING' && this.settings.enableLiveDrag && !zoneAtCursor && !isTwoHandActive) {
        if (!this.lastMoveCursor) {
          this.lastMoveCursor = { ...smoothedPinchCursor };
        } else if (timestampMs - this.lastMoveTimestampMs >= 32) { // smooth ~30 FPS stream
          const deltaX = smoothedPinchCursor.x - this.lastMoveCursor.x;
          const deltaY = smoothedPinchCursor.y - this.lastMoveCursor.y;
          if (Math.abs(deltaX) > 0.002 || Math.abs(deltaY) > 0.002) {
            moveIssued = {
              x: smoothedPinchCursor.x,
              y: smoothedPinchCursor.y,
              deltaX,
              deltaY
            };
            this.lastMoveCursor = { ...smoothedPinchCursor };
            this.lastMoveTimestampMs = timestampMs;
          }
        }
      } else {
        // Reset last move point when hovering in a snap zone so leaving the zone is seamless
        this.lastMoveCursor = { ...smoothedPinchCursor };
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
      if (wasPinching && (this.state === 'GRABBING' || this.state === 'DRAGGING')) {
        // Pinch just released!
        this.state = 'RELEASED';
        this.clearScrollTracking();

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
        // Evaluate V-sign SCROLLING state transitions and relative vertical movement
        const scrollFilter = this.getActiveScrollFilter();

        if (!this.settings.scrollEnabled) {
          this.clearScrollTracking();
          this.state = 'HOVER';
        } else if (this.state === 'SCROLLING') {
          if (vSignDetected) {
            this.vSignLostAtMs = null;
          } else {
            if (this.vSignLostAtMs === null) {
              this.vSignLostAtMs = timestampMs;
            }
            if (timestampMs - this.vSignLostAtMs >= this.settings.scrollExitMs) {
              this.state = 'HOVER';
              this.clearScrollTracking();
            }
          }

          if (this.state === 'SCROLLING') {
            const smoothedScrollCursor = scrollFilter.filter(rawScrollCursor, timestampMs);
            activeCursor = smoothedScrollCursor;
            activeRawCursor = rawScrollCursor;
            this.hoveredZone = null;
            this.hoverZoneEnteredAtMs = null;
            this.armedZone = null;
            this.hoverSwipeHistory = [];

            const dy =
              this.prevScrollSmoothedY !== null
                ? smoothedScrollCursor.y - this.prevScrollSmoothedY
                : 0;
            this.prevScrollSmoothedY = smoothedScrollCursor.y;

            const step = computeScrollDeltaStep({
              dy,
              scrollDeadzone: this.settings.scrollDeadzone,
              scrollGain: this.settings.scrollGain,
              invertScroll: this.settings.invertScroll,
              remainder: this.scrollRemainder
            });

            this.scrollRemainder = step.remainder;
            this.accumulatedScrollDelta += step.delta;

            // Update latched continuous scroll velocity when the hand moves meaningfully:
            // - Moving in the same direction latches the peak stroke speed so decelerating to a stop never slows down scrolling.
            // - Moving intentionally in the opposite direction switches the latched scroll direction.
            if (step.delta !== 0) {
              const sign = Math.sign(step.delta);
              const minSustained = sign * Math.max(45, Math.abs(step.delta));
              if (this.latchedScrollDelta === 0 || Math.sign(this.latchedScrollDelta) === sign) {
                if (Math.abs(minSustained) >= Math.abs(this.latchedScrollDelta)) {
                  this.latchedScrollDelta = clampScrollDelta(minSustained);
                }
              } else if (Math.abs(dy) >= this.settings.scrollDeadzone * 2.5) {
                this.latchedScrollDelta = clampScrollDelta(minSustained);
                this.accumulatedScrollDelta = step.delta;
              }
            }

            if (timestampMs - this.lastScrollDeltaEmitTimestampMs >= SCROLL_BATCH_INTERVAL_MS) {
              let rawToEmit = this.accumulatedScrollDelta;

              // While the V-sign remains visible, keep scrolling at the latched velocity
              // even when the hand stops moving or decelerates inside the camera frame.
              if (vSignDetected && this.latchedScrollDelta !== 0) {
                if (
                  rawToEmit === 0 ||
                  (Math.sign(rawToEmit) === Math.sign(this.latchedScrollDelta) &&
                    Math.abs(rawToEmit) < Math.abs(this.latchedScrollDelta))
                ) {
                  rawToEmit = this.latchedScrollDelta;
                }
              }

              const clamped = clampScrollDelta(rawToEmit);
              if (clamped !== 0) {
                scrollIssued = { delta: clamped };
                this.lastVisualScrollDelta = clamped;
              }
              this.accumulatedScrollDelta = 0;
              this.lastScrollDeltaEmitTimestampMs = timestampMs;
            }
          }
        } else {
          // Currently in IDLE or HOVER: check if V-sign is held long enough to enter SCROLLING
          if (vSignDetected) {
            this.hoverSwipeHistory = [];
            if (this.vSignEnteredAtMs === null) {
              this.vSignEnteredAtMs = timestampMs;
              scrollFilter.reset();
            }
            this.vSignLostAtMs = null;

            const smoothedScrollCursor = scrollFilter.filter(rawScrollCursor, timestampMs);
            const heldMs = timestampMs - this.vSignEnteredAtMs;

            if (heldMs >= this.settings.scrollEnterMs) {
              this.state = 'SCROLLING';
              activeCursor = smoothedScrollCursor;
              activeRawCursor = rawScrollCursor;
              this.prevScrollSmoothedY = smoothedScrollCursor.y;
              this.scrollRemainder = 0;
              this.accumulatedScrollDelta = 0;
              this.latchedScrollDelta = 0;
              this.lastScrollDeltaEmitTimestampMs = -Infinity;
              this.lastVisualScrollDelta = 0;
              this.hoveredZone = null;
              this.hoverZoneEnteredAtMs = null;
              this.armedZone = null;

              scrollIssued = {
                delta: 0,
                begin: true,
                x: smoothedScrollCursor.x,
                y: smoothedScrollCursor.y
              };
            } else {
              this.state = 'HOVER';
              this.hoveredZone = zoneAtCursor;
              this.hoverZoneEnteredAtMs = null;
              this.armedZone = null;
            }
          } else {
            this.clearScrollTracking();
            this.state = 'HOVER';
            this.hoveredZone = zoneAtCursor;
            this.hoverZoneEnteredAtMs = null;
            this.armedZone = null;

            // Open-hand vertical up/down swipe gesture in HOVER state to cycle windows (Virtual Alt+Tab)
            if (
              this.settings.enableWaveCycleGesture &&
              timestampMs - this.lastPinchReleaseTimestampMs >= 450
            ) {
              const swipePoint =
                handsMirrored.length > 0 && handsMirrored[0][9]
                  ? handsMirrored[0][9] // Middle-finger MCP (palm center)
                  : rawCursor;

              this.hoverSwipeHistory.push({ x: swipePoint.x, y: swipePoint.y, t: timestampMs });
              const windowCutoff = timestampMs - 380;
              while (
                this.hoverSwipeHistory.length > 0 &&
                this.hoverSwipeHistory[0].t < windowCutoff
              ) {
                this.hoverSwipeHistory.shift();
              }

              if (
                this.hoverSwipeHistory.length >= 3 &&
                timestampMs - this.lastCycleTimestampMs >= 850 &&
                timestampMs - this.lastSnapTimestampMs >= 650
              ) {
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
      }
    }

    const isScrolling = this.state === 'SCROLLING';

    return {
      state: this.state,
      cursor: activeCursor,
      rawCursor: activeRawCursor,
      isPinching: this.isPinching,
      isScrolling,
      scrollDelta: isScrolling ? this.lastVisualScrollDelta : 0,
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
      cycleIssued,
      scrollIssued
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
        isScrolling: false,
        scrollDelta: 0,
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

    // Hand loss immediately exits SCROLLING or cancels expired grab -> IDLE
    this.reset();
    return {
      state: 'IDLE',
      cursor: null,
      rawCursor: null,
      isPinching: false,
      isScrolling: false,
      scrollDelta: 0,
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

  private getActiveScrollFilter(): PointFilter2D {
    return this.activeFilterType === 'oneEuro' ? this.scrollOneEuroFilter : this.scrollLerpFilter;
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
    timestampMs: number,
    isShiftDown: boolean = false
  ): GestureFrameSnapshot {
    return this.machine.processPointerSimulation(cursor, isMouseDown, timestampMs, isShiftDown);
  }

  reset(): void {
    this.machine.reset();
  }
}
