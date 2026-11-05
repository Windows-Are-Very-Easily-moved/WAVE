import { Injectable, NgZone, signal } from '@angular/core';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandLandmarks, HandTrackingFrame } from '../models/landmark.model';

export type TrackerStatus = 'uninitialized' | 'loading' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class HandTrackerService {
  readonly status = signal<TrackerStatus>('uninitialized');
  readonly delegateUsed = signal<'GPU' | 'CPU'>('GPU');
  readonly errorMessage = signal<string | null>(null);

  private handLandmarker: HandLandmarker | null = null;
  private rafId: number | null = null;
  private rvfcId: number | null = null;
  private trackedVideo: HTMLVideoElement | null = null;
  private isLoopActive = false;
  private lastVideoTime = -1;
  private lastInferenceTimestamp = 0;

  // Rolling FPS calculation
  private frameTimestamps: number[] = [];

  constructor(private readonly ngZone: NgZone) {}

  async initialize(numHands: number = 2): Promise<boolean> {
    if (this.handLandmarker) {
      return true;
    }

    this.status.set('loading');
    this.errorMessage.set(null);

    const wasmBasePath = 'assets/mediapipe/wasm';
    const modelPath = 'assets/mediapipe/hand_landmarker.task';

    try {
      const vision = await FilesetResolver.forVisionTasks(wasmBasePath);

      try {
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55
        });
        this.delegateUsed.set('GPU');
      } catch (gpuError) {
        console.warn('MediaPipe GPU delegate unavailable, falling back to CPU delegate:', gpuError);
        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          numHands,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        this.delegateUsed.set('CPU');
      }

      this.status.set('ready');
      return true;
    } catch (err: any) {
      console.error('Failed to initialize MediaPipe HandLandmarker:', err);
      this.status.set('error');
      this.errorMessage.set(
        err?.message || 'Failed to load local MediaPipe HandLandmarker model.'
      );
      return false;
    }
  }

  /**
   * Starts the vision loop outside Angular's zone so 60 FPS vision inference
   * never triggers unnecessary full-tree Angular change detection cycles.
   * Uses `video.requestVideoFrameCallback` where supported so camera frame processing
   * continues smoothly even when the main browser tab is unfocused or in Picture-in-Picture.
   */
  startTrackingLoop(
    videoElement: HTMLVideoElement,
    onFrame: (frame: HandTrackingFrame) => void
  ): void {
    this.stopTrackingLoop();
    this.trackedVideo = videoElement;
    this.isLoopActive = true;
    this.lastVideoTime = -1;
    this.lastInferenceTimestamp = 0;
    this.frameTimestamps = [];

    const hasRvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

    this.ngZone.runOutsideAngular(() => {
      const processVideoFrame = () => {
        if (!this.isLoopActive || !this.handLandmarker) {
          return;
        }

        if (videoElement.readyState >= 2 && videoElement.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = videoElement.currentTime;
          // MediaPipe VIDEO mode requires strictly monotonically increasing timestamps
          const nowMs = Math.max(performance.now(), this.lastInferenceTimestamp + 1);
          this.lastInferenceTimestamp = nowMs;

          const result = this.handLandmarker.detectForVideo(videoElement, nowMs);
          const fps = this.computeRollingFps(nowMs);

          const hands: HandLandmarks[] = (result.landmarks ?? []).map((hand) =>
            hand.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z }))
          );

          onFrame({
            hands,
            timestampMs: nowMs,
            fps
          });
        }
      };

      if (hasRvfc) {
        const onVideoFrame = () => {
          if (!this.isLoopActive) return;
          processVideoFrame();
          if (this.isLoopActive) {
            this.rvfcId = (videoElement as any).requestVideoFrameCallback(onVideoFrame);
          }
        };
        this.rvfcId = (videoElement as any).requestVideoFrameCallback(onVideoFrame);
      } else {
        const tick = () => {
          if (!this.isLoopActive) return;
          processVideoFrame();
          if (this.isLoopActive) {
            this.rafId = requestAnimationFrame(tick);
          }
        };
        this.rafId = requestAnimationFrame(tick);
      }
    });
  }

  stopTrackingLoop(): void {
    this.isLoopActive = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.rvfcId !== null && this.trackedVideo && 'cancelVideoFrameCallback' in this.trackedVideo) {
      try {
        (this.trackedVideo as any).cancelVideoFrameCallback(this.rvfcId);
      } catch {
        // Ignore if already cancelled
      }
      this.rvfcId = null;
    }
    this.trackedVideo = null;
  }

  private computeRollingFps(nowMs: number): number {
    this.frameTimestamps.push(nowMs);
    const cutoff = nowMs - 1000;
    while (this.frameTimestamps.length > 0 && this.frameTimestamps[0] < cutoff) {
      this.frameTimestamps.shift();
    }
    return this.frameTimestamps.length;
  }
}

