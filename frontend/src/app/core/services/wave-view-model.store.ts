import { Injectable, NgZone, computed, effect, inject, signal } from '@angular/core';
import { CameraService, CameraState } from './camera.service';
import { HandTrackerService, TrackerStatus } from './hand-tracker.service';
import { GestureEngineService } from './gesture-engine.service';
import { BackendConnectionState, WindowApiService } from './window-api.service';
import { SettingsService } from './settings.service';
import { SceneApiService } from './scene-api.service';
import {
  OpenWindowCandidate,
  SceneApplyResult,
  SceneSummary,
  SelectedSceneWindowInput
} from '../models/scene.model';
import { SceneGestureDetector } from '../utils/scene-gesture.detector';
import {
  FilterType,
  GestureFrameSnapshot,
  GestureState,
  ScepterSettings
} from '../models/gesture.model';
import { Point2D } from '../models/landmark.model';
import { SnapPosition } from '../models/snap-action.model';

export type PracticeGestureId = 'hover' | 'grab' | 'snap' | 'scroll' | 'switch';

export interface PracticeCardMeta {
  id: PracticeGestureId;
  name: string;
  hint: string;
}

export const PRACTICE_GESTURE_CARDS: readonly PracticeCardMeta[] = [
  { id: 'hover', name: 'Hover', hint: 'Open hand, move it' },
  { id: 'grab', name: 'Grab', hint: 'Pinch thumb and index' },
  { id: 'snap', name: 'Snap to edge', hint: 'Drag to a screen edge, release' },
  { id: 'scroll', name: 'Scroll', hint: 'Peace sign, move up or down' },
  { id: 'switch', name: 'Switch windows', hint: 'Sideways open palm, move up' }
];

export interface ActionLogEntry {
  id: number;
  timestamp: string;
  label: string;
  detail: string;
  live: boolean;
}

export interface WaveToast {
  id: number;
  title: string;
  description?: string;
  tone: 'gold' | 'armed' | 'info' | 'warn';
}

export interface StateDisplayMeta {
  chip: string;
  label: string;
  hint: string;
  tone: 'idle' | 'gold' | 'gold-bright' | 'armed';
}

const PRACTICE_STORAGE_KEY = 'wave.practice.v1';
const MUTED_STORAGE_KEY = 'wave.muted';

const INITIAL_PRACTICE_STATE: Record<PracticeGestureId, boolean> = {
  hover: false,
  grab: false,
  snap: false,
  scroll: false,
  switch: false
};

const INITIAL_FRAME: GestureFrameSnapshot = {
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
  handsMirrored: [],
  isScrolling: false,
  scrollDelta: 0
};

@Injectable({ providedIn: 'root' })
export class WaveViewModelStore {
  private readonly cameraService = inject(CameraService);
  private readonly trackerService = inject(HandTrackerService);
  private readonly gestureEngine = inject(GestureEngineService);
  private readonly apiService = inject(WindowApiService);
  private readonly settingsService = inject(SettingsService);
  private readonly sceneApi = inject(SceneApiService);
  private readonly ngZone = inject(NgZone);

  // Core reactive frame & telemetry signals
  readonly frame = signal<GestureFrameSnapshot>(INITIAL_FRAME);
  /** High-frequency frame reference read by the outside-Angular Canvas HUD loop at 60 FPS. */
  latestFrame: GestureFrameSnapshot = INITIAL_FRAME;
  readonly fps = signal<number>(0);
  readonly trackingConfidence = signal<number>(0);

  // Wave Scenes state signals
  readonly scenesEnabled = computed<boolean>(() => this.settings().scenesEnabled);
  readonly scenes = signal<SceneSummary[]>([]);
  readonly scenesLoading = signal<boolean>(false);
  readonly openWindowCandidates = signal<OpenWindowCandidate[]>([]);
  readonly openWindowsLoading = signal<boolean>(false);
  readonly scenesOpen = signal<boolean>(false);
  readonly undoAvailable = signal<boolean>(false);
  readonly lastSceneResult = signal<SceneApplyResult | null>(null);
  readonly saveSceneModalOpen = signal<boolean>(false);
  readonly sceneHoldProgress = signal<number>(0);
  readonly detectedSceneGesture = signal<3 | 4 | null>(null);
  readonly sceneDetector = new SceneGestureDetector();

  // Mode & UI drawer/modal signals
  readonly simulationMode = signal<boolean>(false);
  readonly compactMode = signal<boolean>(false);
  readonly isPipActive = signal<boolean>(false);
  readonly settingsOpen = signal<boolean>(false);
  readonly guideOpen = signal<boolean>(false);
  readonly muted = signal<boolean>(this.loadMutedFromStorage());
  readonly tabHidden = signal<boolean>(false);

  // Practice checklist state (persisted in localStorage)
  readonly practiceProgress = signal<Record<PracticeGestureId, boolean>>(
    this.loadPracticeFromStorage()
  );
  readonly practiceCards = PRACTICE_GESTURE_CARDS;
  readonly practiceCompletedCount = computed(() => {
    const p = this.practiceProgress();
    return (
      (p.hover ? 1 : 0) +
      (p.grab ? 1 : 0) +
      (p.snap ? 1 : 0) +
      (p.scroll ? 1 : 0) +
      (p.switch ? 1 : 0)
    );
  });
  readonly practiceCollapsed = signal<boolean>(
    this.isAllPracticeCompleted(this.loadPracticeFromStorage())
  );

  // Action history, last action, toasts, and accessibility live announcements
  readonly lastActionText = signal<string | null>(null);
  readonly actionLog = signal<ActionLogEntry[]>([]);
  readonly toasts = signal<WaveToast[]>([]);
  readonly ariaAnnouncement = signal<string>('');

  // Facade pass-through signals from underlying services
  readonly settings = this.settingsService.settings;
  readonly liveControl = this.apiService.liveControl;
  readonly backendStatus = computed<BackendConnectionState>(() =>
    this.apiService.connectionState()
  );
  readonly cameraStatus = computed<CameraState>(() => this.cameraService.state());
  readonly cameraError = computed<string | null>(() => this.cameraService.errorMessage());
  readonly trackerStatus = computed<TrackerStatus>(() => this.trackerService.status());
  readonly delegateUsed = computed<'GPU' | 'CPU'>(() => this.trackerService.delegateUsed());
  readonly activeWindow = this.apiService.activeWindow;
  readonly recentWindows = this.apiService.recentWindows;

  // Derived gesture view-model signals required by Phase 2 spec
  readonly gestureState = computed<GestureState>(() => this.frame().state);
  readonly cursor = computed<Point2D | null>(() => this.frame().cursor);
  readonly pinchAmount = computed<number>(() => this.frame().pinchProgress);
  readonly normalizedPinchDistance = computed<number>(
    () => this.frame().normalizedPinchDistance
  );
  readonly hoveredZone = computed<SnapPosition | null>(() => this.frame().hoveredZone);
  readonly armedZone = computed<SnapPosition | null>(() => this.frame().armedZone);
  readonly zone = computed<SnapPosition | null>(
    () => this.frame().armedZone ?? this.frame().hoveredZone
  );
  readonly armed = computed<boolean>(() => this.frame().armedZone !== null);
  readonly isScrolling = computed<boolean>(() => !!this.frame().isScrolling);
  readonly scrollDelta = computed<number>(() => this.frame().scrollDelta ?? 0);

  private lockedGrabTitle = signal<string | null>(null);
  readonly grabbedWindowTitle = computed<string | null>(() => {
    const st = this.frame().state;
    if (st === 'GRABBING' || st === 'DRAGGING') {
      return this.lockedGrabTitle() ?? this.activeWindow()?.title ?? 'Active Window';
    }
    return this.activeWindow()?.title ?? null;
  });

  readonly lastResult = computed<string | null>(() => {
    return this.lastActionText() ?? this.apiService.lastSnapResult()?.message ?? null;
  });

  readonly confidenceBars = computed<boolean[]>(() => {
    const conf = this.trackingConfidence();
    const lit = Math.round(conf * 5);
    return [0, 1, 2, 3, 4].map((i) => i < lit);
  });

  readonly stateMeta = computed<StateDisplayMeta>(() => {
    const f = this.frame();
    switch (f.state) {
      case 'IDLE':
        return {
          chip: 'IDLE',
          label: 'IDLE',
          hint: this.simulationMode()
            ? 'Move cursor inside stage · Click & hold to grab · Hold Shift + move to scroll'
            : 'Raise a hand into view',
          tone: 'idle'
        };
      case 'HOVER':
        return {
          chip: 'HOVER',
          label: 'TRACKING',
          hint: 'Pinch to grab · Peace sign to scroll · Sideways open palm up to switch windows',
          tone: 'gold'
        };
      case 'GRABBING':
        return {
          chip: 'GRABBING',
          label: 'GRABBING',
          hint: 'Drag toward a screen edge to snap',
          tone: 'gold-bright'
        };
      case 'DRAGGING':
        if (f.armedZone) {
          return {
            chip: `ARMED · ${this.formatZoneName(f.armedZone)}`,
            label: `ARMED · ${this.formatZoneName(f.armedZone)}`,
            hint: 'Release pinch now to snap window',
            tone: 'armed'
          };
        }
        return {
          chip: 'DRAGGING',
          label: 'DRAGGING',
          hint: 'Hold in an edge zone to arm, then release to snap',
          tone: 'gold-bright'
        };
      case 'RELEASED':
        return {
          chip: 'RELEASED',
          label: 'SNAP SENT',
          hint: 'Window snap released',
          tone: 'armed'
        };
      case 'SCROLLING':
        return {
          chip: 'SCROLL',
          label: 'SCROLL',
          hint: 'Move hand up or down to scroll',
          tone: 'armed'
        };
    }
  });

  private nextLogId = 1;
  private nextToastId = 1;
  private audioCtx: AudioContext | null = null;
  private lastState: GestureState = 'IDLE';
  private lastArmedZone: SnapPosition | null = null;
  private lastUiSyncMs = -Infinity;
  private scrollCoastTimer: ReturnType<typeof setInterval> | null = null;
  private lastScrollDispatchedAtMs = -Infinity;

  constructor() {
    const currentSettings = this.settingsService.settings();
    this.gestureEngine.updateSettings(currentSettings);
    this.sceneDetector.setOptions({
      holdMs: currentSettings.sceneHoldMs,
      cooldownMs: currentSettings.sceneCooldownMs
    });
    try {
      effect(() => {
        const s = this.settingsService.settings();
        this.gestureEngine.updateSettings(s);
        this.sceneDetector.setOptions({
          holdMs: s.sceneHoldMs,
          cooldownMs: s.sceneCooldownMs
        });
      });
    } catch {
      // Fallback when instantiated in a lightweight test injector without EffectScheduler
    }
    void this.loadScenes();
  }

  // --- Wave Scenes Management ---

  toggleScenesDrawer(force?: boolean): void {
    const next = force !== undefined ? force : !this.scenesOpen();
    this.scenesOpen.set(next);
    if (next) {
      void this.loadScenes();
    }
  }

  toggleSaveSceneModal(force?: boolean): void {
    const next = force !== undefined ? force : !this.saveSceneModalOpen();
    this.saveSceneModalOpen.set(next);
    if (next) {
      void this.loadOpenWindows();
    }
  }

  async loadOpenWindows(): Promise<void> {
    if (!this.settings().scenesEnabled) return;
    this.openWindowsLoading.set(true);
    try {
      const list = await this.sceneApi.getOpenWindows();
      this.openWindowCandidates.set(list);
    } finally {
      this.openWindowsLoading.set(false);
    }
  }

  async loadScenes(): Promise<void> {
    if (!this.settings().scenesEnabled) return;
    this.scenesLoading.set(true);
    try {
      const list = await this.sceneApi.getScenes();
      this.scenes.set(list);
    } finally {
      this.scenesLoading.set(false);
    }
  }

  async captureCurrentScene(
    name?: string,
    gestureFingers?: 3 | 4 | null,
    selectedWindows?: SelectedSceneWindowInput[]
  ): Promise<boolean> {
    try {
      const payload = selectedWindows !== undefined
        ? { name, gestureFingers, selectedWindows }
        : { name, gestureFingers };
      const captured = await this.sceneApi.captureScene(payload);
      if (captured) {
        this.pushToast(
          'Scene saved',
          `Saved '${captured.name}' with ${captured.windowCount} windows.`,
          'armed'
        );
        this.recordAction('Saved scene', captured.name);
        this.announce(`Scene ${captured.name} saved with ${captured.windowCount} windows.`);
        this.scenes.update((arr) => [captured, ...arr.filter((s) => s.id !== captured.id)]);
        this.saveSceneModalOpen.set(false);
        return true;
      }
      return false;
    } catch (err: any) {
      this.pushToast('Could not save scene', err?.message || 'Error saving layout', 'warn');
      return false;
    }
  }

  async applyScene(scene: SceneSummary): Promise<void> {
    this.recordAction(`Restoring scene: ${scene.name}`, `${scene.windowCount} windows`);
    this.announce(`Restoring scene ${scene.name}`);
    const result = await this.sceneApi.applyScene(scene);
    this.lastSceneResult.set(result);
    this.undoAvailable.set(true);

    const isLive = this.liveControl();
    const restoredCount = result.restored.length;
    const missingCount = result.missing.length;

    let desc = `${restoredCount} of ${scene.windowCount} windows restored.`;
    if (missingCount > 0) {
      desc += ` (${result.missing.map((m) => m.processName).join(', ')} not open)`;
    }
    if (!isLive) {
      desc += ' [Practice mode: windows not moved]';
    }

    this.pushToast(
      `Restored '${scene.name}'`,
      desc,
      isLive ? 'armed' : 'gold'
    );
    this.announce(`Scene ${scene.name} restored. ${desc}`);
  }

  async undoLastScene(): Promise<void> {
    const res = await this.sceneApi.undoLastApply();
    if (res.success) {
      this.undoAvailable.set(false);
      this.pushToast('Layout restored', res.message, 'info');
      this.recordAction('Undid scene layout', 'Previous positions restored');
      this.announce('Previous window layout restored.');
    } else {
      this.pushToast('Undo failed', res.message, 'warn');
    }
  }

  async deleteScene(id: string): Promise<void> {
    const target = this.scenes().find((s) => s.id === id);
    const ok = await this.sceneApi.deleteScene(id);
    if (ok) {
      this.pushToast('Scene deleted', target ? `Removed '${target.name}'` : undefined, 'info');
      await this.loadScenes();
    } else if (!this.liveControl()) {
      this.pushToast('Practice mode', 'Turn on Live control to delete stored scenes.', 'warn');
    }
  }

  async updateScene(
    id: string,
    name?: string,
    gestureFingers?: 3 | 4 | null,
    selectedWindows?: SelectedSceneWindowInput[]
  ): Promise<boolean> {
    try {
      const payload = selectedWindows !== undefined
        ? { name, gestureFingers, selectedWindows }
        : { name, gestureFingers };
      const updated = await this.sceneApi.updateScene(id, payload);
      if (updated) {
        this.pushToast('Scene updated', `'${updated.name}' saved.`, 'info');
        await this.loadScenes();
        return true;
      }
      return false;
    } catch (err: any) {
      this.pushToast('Could not update scene', err?.message || 'Error updating scene', 'warn');
      return false;
    }
  }

  async triggerSceneGesture(fingers: 3 | 4): Promise<void> {
    const matched = this.scenes().find((s) => s.gestureFingers === fingers);
    const signLabel = fingers === 3 ? '🤘 Rock-On sign' : '🤙 Shaka sign';
    this.playSound('snap');
    if (matched) {
      this.pushToast(
        `${signLabel} detected`,
        `Restoring scene '${matched.name}' (${matched.windowCount} windows)...`,
        'armed'
      );
      this.announce(`${signLabel} detected. Restoring scene ${matched.name}.`);
      await this.applyScene(matched);
    } else {
      this.pushToast(
        `${signLabel} detected`,
        `No scene is assigned to ${signLabel}. Assign one in the Scenes panel (W).`,
        'info'
      );
      this.announce(`${signLabel} detected, but no scene is assigned.`);
    }
  }

  // --- Settings & Toggles ---

  updateSetting<K extends keyof ScepterSettings>(key: K, value: ScepterSettings[K]): void {
    this.settingsService.update(key, value);
    this.gestureEngine.updateSettings(this.settingsService.settings());
  }

  setFilterType(type: FilterType): void {
    this.settingsService.update('filterType', type);
    this.gestureEngine.updateSettings(this.settingsService.settings());
  }

  resetSettingsToDefaults(): void {
    this.settingsService.resetToDefaults();
    this.gestureEngine.updateSettings(this.settingsService.settings());
    this.pushToast('Settings reset to defaults', undefined, 'info');
    this.announce('Settings reset to defaults');
  }

  setLiveControl(enabled: boolean): void {
    this.apiService.setLiveControl(enabled);
    if (enabled) {
      this.pushToast(
        'Live control enabled',
        'Gestures now control real Windows apps via Win32 API.',
        'armed'
      );
      this.announce('Live control enabled. Gestures now control your computer.');
    } else {
      this.pushToast(
        'Practice mode active',
        'Turn on Live control when ready to move real windows.',
        'info'
      );
      this.announce('Practice mode active. Live control is off.');
    }
  }

  toggleLiveControl(): void {
    this.setLiveControl(!this.liveControl());
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    try {
      localStorage.setItem(MUTED_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage errors
    }
    this.announce(next ? 'Sound cues muted' : 'Sound cues unmuted');
    this.pushToast(
      next ? 'Sound muted' : 'Sound unmuted',
      next ? 'All audio cues are now silenced.' : 'Audio cues are now enabled.',
      next ? 'warn' : 'info'
    );
  }

  toggleSettingsDrawer(force?: boolean): void {
    const next = force !== undefined ? force : !this.settingsOpen();
    this.settingsOpen.set(next);
  }

  toggleGuideModal(force?: boolean): void {
    const next = force !== undefined ? force : !this.guideOpen();
    this.guideOpen.set(next);
  }

  toggleCompactMode(force?: boolean): void {
    const next = force !== undefined ? force : !this.compactMode();
    this.compactMode.set(next);
  }

  setTabHidden(hidden: boolean): void {
    this.tabHidden.set(hidden);
  }

  retryBackendHealth(): void {
    void this.apiService.checkHealthAndActiveWindow();
  }

  // --- Practice Checklist ---

  markPracticeComplete(id: PracticeGestureId): void {
    const current = this.practiceProgress();
    if (current[id]) return;

    const updated = { ...current, [id]: true };
    this.practiceProgress.set(updated);
    this.savePracticeToStorage(updated);

    if (this.isAllPracticeCompleted(updated)) {
      this.practiceCollapsed.set(true);
    }

    const meta = PRACTICE_GESTURE_CARDS.find((c) => c.id === id);
    if (meta) {
      this.announce(`Practice gesture completed: ${meta.name}`);
    }
  }

  togglePracticeCollapsed(force?: boolean): void {
    const next = force !== undefined ? force : !this.practiceCollapsed();
    this.practiceCollapsed.set(next);
  }

  resetPractice(): void {
    const reset = { ...INITIAL_PRACTICE_STATE };
    this.practiceProgress.set(reset);
    this.practiceCollapsed.set(false);
    this.savePracticeToStorage(reset);
    this.announce('Practice checklist reset');
  }

  // --- Camera & Vision Lifecycle ---

  async startCamera(videoElement: HTMLVideoElement): Promise<boolean> {
    this.simulationMode.set(false);
    const numHands = this.settings().enableTwoHandResize ? 2 : 1;
    const trackerOk = await this.trackerService.initialize(numHands);
    const camOk = await this.cameraService.startCamera(videoElement);

    if (trackerOk && camOk) {
      this.startScrollCoastLoop();
      this.trackerService.startTrackingLoop(videoElement, (trackingFrame) => {
        const snapshot = this.gestureEngine.processLandmarks(
          trackingFrame.hands,
          trackingFrame.timestampMs
        );
        const hasHand = trackingFrame.hands.length > 0;
        const confidence = hasHand ? 0.92 : 0;
        this.processRealtimeFrame(
          snapshot,
          trackingFrame.fps,
          confidence,
          trackingFrame.timestampMs
        );
      });
      return true;
    }
    return false;
  }

  stopCamera(videoElement?: HTMLVideoElement): void {
    this.stopScrollCoastLoop();
    this.trackerService.stopTrackingLoop();
    this.cameraService.stopCamera(videoElement);
    this.gestureEngine.reset();
    this.latestFrame = INITIAL_FRAME;
    this.frame.set(INITIAL_FRAME);
    this.fps.set(0);
    this.trackingConfidence.set(0);
  }

  enableSimulationMode(videoElement?: HTMLVideoElement): void {
    this.trackerService.stopTrackingLoop();
    this.cameraService.stopCamera(videoElement);
    this.gestureEngine.reset();
    this.latestFrame = INITIAL_FRAME;
    this.simulationMode.set(true);
    this.fps.set(60);
    this.trackingConfidence.set(0);
    this.startScrollCoastLoop();
    this.announce('Mouse simulation mode enabled');
  }

  disableSimulationMode(): void {
    this.stopScrollCoastLoop();
    this.simulationMode.set(false);
    this.gestureEngine.reset();
    this.latestFrame = INITIAL_FRAME;
    this.frame.set(INITIAL_FRAME);
    this.fps.set(0);
    this.trackingConfidence.set(0);
  }

  private startScrollCoastLoop(): void {
    this.stopScrollCoastLoop();
    if (typeof window === 'undefined') return;
    this.ngZone.runOutsideAngular(() => {
      this.scrollCoastTimer = setInterval(() => {
        const snap = this.latestFrame;
        if (snap.state !== 'SCROLLING') return;
        const delta = snap.scrollDelta ?? 0;
        if (delta === 0) return;

        const now = performance.now();
        if (now - this.lastScrollDispatchedAtMs >= 28) {
          this.lastScrollDispatchedAtMs = now;
          void this.apiService.scrollInput({ delta });
        }
      }, 30);
    });
  }

  private stopScrollCoastLoop(): void {
    if (this.scrollCoastTimer !== null) {
      clearInterval(this.scrollCoastTimer);
      this.scrollCoastTimer = null;
    }
  }

  processSimulationStep(
    pointer: Point2D | null,
    isMouseDown: boolean,
    timestampMs: number,
    isShiftDown: boolean
  ): GestureFrameSnapshot {
    const snapshot = this.gestureEngine.processPointerSimulation(
      pointer,
      isMouseDown,
      timestampMs,
      isShiftDown
    );
    this.processRealtimeFrame(snapshot, 60, pointer ? 1.0 : 0, timestampMs);
    return snapshot;
  }

  /**
   * Processes high-frequency vision/simulation frames outside Angular's zone.
   * Updates `latestFrame` every frame for the 60 FPS Canvas HUD, and only enters
   * `ngZone.run` when discrete UI state changes or at a throttled 4 Hz telemetry rate.
   */
  private processRealtimeFrame(
    snapshot: GestureFrameSnapshot,
    currentFps: number,
    confidence: number,
    timestampMs: number
  ): void {
    const prevUi = this.frame();
    this.latestFrame = snapshot;

    const hasDiscreteEvent = Boolean(
      snapshot.grabIssued ||
        snapshot.snapIssued ||
        snapshot.cycleIssued ||
        snapshot.resizeIssued ||
        snapshot.scrollIssued?.begin
    );

    const hasStateChange =
      snapshot.state !== prevUi.state ||
      snapshot.armedZone !== prevUi.armedZone ||
      snapshot.hoveredZone !== prevUi.hoveredZone ||
      snapshot.isPinching !== prevUi.isPinching ||
      Boolean(snapshot.isScrolling) !== Boolean(prevUi.isScrolling);

    // High-frequency streaming commands (live drag & continuous scroll wheel) run outside Angular zone
    if (!hasDiscreteEvent && !hasStateChange) {
      if (snapshot.moveIssued) {
        void this.apiService.moveWindow({
          x: snapshot.moveIssued.x,
          y: snapshot.moveIssued.y,
          deltaX: snapshot.moveIssued.deltaX,
          deltaY: snapshot.moveIssued.deltaY
        });
      }
      if (snapshot.scrollIssued && !snapshot.scrollIssued.begin) {
        this.lastScrollDispatchedAtMs = performance.now();
        void this.apiService.scrollInput(snapshot.scrollIssued);
      }
    }

    // Wave Scenes Gesture Observer (passively observes orthogonal 🤘 Rock-On & 🤙 Shaka signs in HOVER)
    if (this.scenesEnabled() && !this.simulationMode()) {
      const hand = snapshot.handsMirrored[0] ?? null;
      const sceneRes = this.sceneDetector.update(
        hand,
        snapshot.state,
        snapshot.velocity ?? 0,
        timestampMs
      );

      if (sceneRes.progress !== this.sceneHoldProgress()) {
        this.sceneHoldProgress.set(sceneRes.progress);
      }
      if (sceneRes.fingers !== this.detectedSceneGesture()) {
        this.detectedSceneGesture.set(sceneRes.fingers);
      }

      if (sceneRes.triggered && sceneRes.fingers) {
        this.ngZone.run(() => {
          void this.triggerSceneGesture(sceneRes.fingers!);
        });
      }
    } else if (this.sceneHoldProgress() > 0 || this.detectedSceneGesture() !== null) {
      this.sceneHoldProgress.set(0);
      this.detectedSceneGesture.set(null);
    }

    const telemetryDue = timestampMs - this.lastUiSyncMs >= 250;
    if (hasDiscreteEvent || hasStateChange || telemetryDue) {
      this.lastUiSyncMs = timestampMs;
      this.ngZone.run(() => {
        if (this.fps() !== currentFps) {
          this.fps.set(currentFps);
        }
        if (this.trackingConfidence() !== confidence) {
          this.trackingConfidence.set(confidence);
        }
        if (hasDiscreteEvent || hasStateChange) {
          this.applyGestureSnapshot(snapshot);
        } else {
          this.frame.set(snapshot);
          if (snapshot.scrollIssued && snapshot.scrollIssued.delta !== 0) {
            const dir = snapshot.scrollIssued.delta > 0 ? 'up' : 'down';
            this.lastActionText.set(
              `Scroll ${dir} (${snapshot.scrollIssued.delta > 0 ? '+' : ''}${snapshot.scrollIssued.delta})`
            );
          }
        }
      });
    }
  }

  // --- Frame & Side-Effect Processing ---

  applyGestureSnapshot(snapshot: GestureFrameSnapshot): void {
    this.latestFrame = snapshot;
    this.frame.set(snapshot);

    // State transition announcements & audio cues
    if (snapshot.state !== this.lastState) {
      if (snapshot.state === 'HOVER') {
        this.markPracticeComplete('hover');
      } else if (snapshot.state === 'GRABBING') {
        this.markPracticeComplete('grab');
        this.lockedGrabTitle.set(this.activeWindow()?.title ?? 'Active Window');
        this.playSound('pinch');
      } else if (snapshot.state === 'SCROLLING') {
        this.markPracticeComplete('scroll');
        this.playSound('scroll');
      } else if (snapshot.state === 'IDLE') {
        this.lockedGrabTitle.set(null);
      }
      this.lastState = snapshot.state;
    }

    if (snapshot.armedZone && snapshot.armedZone !== this.lastArmedZone) {
      this.playSound('arm');
      this.announce(`Zone armed: ${this.formatZoneName(snapshot.armedZone)}`);
    }
    this.lastArmedZone = snapshot.armedZone;

    // 1. Grab
    if (snapshot.grabIssued) {
      this.markPracticeComplete('grab');
      const winTitle = this.activeWindow()?.title ?? 'Window';
      this.recordAction('Grabbed window', winTitle);
      void this.apiService.grabWindow({
        x: snapshot.grabIssued.x,
        y: snapshot.grabIssued.y
      });
    }

    // 2. Live drag move
    if (snapshot.moveIssued) {
      void this.apiService.moveWindow({
        x: snapshot.moveIssued.x,
        y: snapshot.moveIssued.y,
        deltaX: snapshot.moveIssued.deltaX,
        deltaY: snapshot.moveIssued.deltaY
      });
    }

    // 3. Snap to edge
    if (snapshot.snapIssued) {
      this.markPracticeComplete('snap');
      this.playSound('snap');
      const zoneLabel = this.formatZoneName(snapshot.snapIssued.position);
      const winTitle = this.lockedGrabTitle() ?? this.activeWindow()?.title ?? 'Window';
      this.recordAction(`Snapped ${zoneLabel}`, winTitle);
      this.pushToast(
        `Snapped ${zoneLabel}`,
        this.liveControl()
          ? `${winTitle} moved via Win32`
          : 'Practice mode — turn on Live control to move real windows',
        this.liveControl() ? 'armed' : 'gold'
      );
      void this.apiService.snapWindow({
        position: snapshot.snapIssued.position,
        ratio: snapshot.snapIssued.ratio
      });
    }

    // 4. Two-hand resize
    if (snapshot.resizeIssued) {
      void this.apiService.resizeWindow({
        scaleFactor: snapshot.resizeIssued.scaleFactor
      });
    }

    // 5. Wave cycle
    if (snapshot.cycleIssued) {
      this.markPracticeComplete('switch');
      this.playSound('snap');
      this.recordAction('Switched window', `Direction: ${snapshot.cycleIssued.direction}`);
      this.pushToast(
        'Window switched',
        this.liveControl()
          ? 'Switched to next window via Win32'
          : 'Practice mode — turn on Live control to switch real windows',
        this.liveControl() ? 'armed' : 'gold'
      );
      void this.apiService.cycleWindow({
        direction: snapshot.cycleIssued.direction
      });
    }

    // 6. V-Sign Scroll
    if (snapshot.scrollIssued) {
      this.markPracticeComplete('scroll');
      if (snapshot.scrollIssued.begin) {
        this.recordAction('V-Sign scroll started', 'Cursor aligned to hand');
      } else if (snapshot.scrollIssued.delta !== 0) {
        this.lastScrollDispatchedAtMs = performance.now();
        const dir = snapshot.scrollIssued.delta > 0 ? 'up' : 'down';
        this.lastActionText.set(`Scroll ${dir} (${snapshot.scrollIssued.delta > 0 ? '+' : ''}${snapshot.scrollIssued.delta})`);
      }
      void this.apiService.scrollInput(snapshot.scrollIssued);
    }
  }

  // --- Direct Commands (for Settings/Quick Actions) ---

  triggerDirectSnap(position: SnapPosition): void {
    this.markPracticeComplete('snap');
    const zoneLabel = this.formatZoneName(position);
    this.recordAction(`Snapped ${zoneLabel}`, this.activeWindow()?.title ?? 'Direct trigger');
    void this.apiService.snapWindow({
      position,
      ratio: this.settings().snapRatio
    });
  }

  triggerCycle(direction: 'next' | 'prev'): void {
    this.markPracticeComplete('switch');
    this.recordAction('Switched window', direction);
    void this.apiService.cycleWindow({ direction });
  }

  selectTargetWindow(handle: number): void {
    void this.apiService.cycleWindow({ direction: 'next', handle });
  }

  dismissToast(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  clearActionLog(): void {
    this.actionLog.set([]);
  }

  formatZoneName(zone: SnapPosition | null): string {
    if (!zone) return '';
    switch (zone) {
      case 'left':
        return 'LEFT';
      case 'right':
        return 'RIGHT';
      case 'top':
        return 'MAXIMIZE';
      case 'topLeft':
        return 'TOP-LEFT';
      case 'topRight':
        return 'TOP-RIGHT';
      case 'bottomLeft':
        return 'BTM-LEFT';
      case 'bottomRight':
        return 'BTM-RIGHT';
      case 'nextMonitor':
        return 'NEXT MONITOR';
    }
  }

  // --- Internal Helpers ---

  private recordAction(label: string, detail: string): void {
    const time = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const entry: ActionLogEntry = {
      id: this.nextLogId++,
      timestamp: time,
      label,
      detail,
      live: this.liveControl()
    };
    this.lastActionText.set(label);
    this.actionLog.update((prev) => [entry, ...prev].slice(0, 25));
  }

  private pushToast(
    title: string,
    description?: string,
    tone: WaveToast['tone'] = 'gold'
  ): void {
    const id = this.nextToastId++;
    const toast: WaveToast = { id, title, description, tone };
    this.toasts.update((prev) => [...prev.slice(-2), toast]);
    setTimeout(() => {
      this.dismissToast(id);
    }, 2800);
  }

  private announce(message: string): void {
    this.ariaAnnouncement.set(message);
  }

  private playSound(kind: 'pinch' | 'arm' | 'snap' | 'scroll'): void {
    if (this.muted() || typeof window === 'undefined') return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!this.audioCtx) {
        this.audioCtx = new Ctx();
      }
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const playTone = (freq: number, dur: number, type: OscillatorType = 'sine', gainVal = 0.04, delay = 0) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(gainVal, ctx.currentTime + delay + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur + 0.02);
      };

      if (kind === 'pinch') {
        playTone(520, 0.06, 'triangle', 0.035);
      } else if (kind === 'arm') {
        playTone(660, 0.08, 'sine', 0.04);
      } else if (kind === 'snap') {
        playTone(587.33, 0.08, 'triangle', 0.045, 0);
        playTone(880, 0.12, 'triangle', 0.05, 0.055);
      } else if (kind === 'scroll') {
        playTone(620, 0.06, 'sine', 0.03);
      }
    } catch {
      // Ignore WebAudio restriction errors
    }
  }

  private isAllPracticeCompleted(state: Record<PracticeGestureId, boolean>): boolean {
    return Boolean(
      state.hover &&
        state.grab &&
        state.snap &&
        state.scroll &&
        state.switch
    );
  }

  private loadPracticeFromStorage(): Record<PracticeGestureId, boolean> {
    try {
      const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
      if (!raw) return { ...INITIAL_PRACTICE_STATE };
      const parsed = JSON.parse(raw) as Partial<Record<PracticeGestureId, boolean>>;
      return {
        hover: !!parsed.hover,
        grab: !!parsed.grab,
        snap: !!parsed.snap,
        scroll: !!parsed.scroll,
        switch: !!parsed.switch
      };
    } catch {
      return { ...INITIAL_PRACTICE_STATE };
    }
  }

  private savePracticeToStorage(state: Record<PracticeGestureId, boolean>): void {
    try {
      localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }

  private loadMutedFromStorage(): boolean {
    try {
      return localStorage.getItem(MUTED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
