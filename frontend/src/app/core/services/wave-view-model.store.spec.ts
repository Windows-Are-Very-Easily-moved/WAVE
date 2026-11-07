import '@angular/compiler';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EnvironmentInjector,
  NgZone,
  createEnvironmentInjector,
  signal
} from '@angular/core';
import { of } from 'rxjs';
import { WaveViewModelStore, PRACTICE_GESTURE_CARDS } from './wave-view-model.store';
import { WindowApiService } from './window-api.service';
import { SceneApiService } from './scene-api.service';
import { CameraService } from './camera.service';
import { HandTrackerService } from './hand-tracker.service';
import { SettingsService } from './settings.service';
import { GestureEngineService } from './gesture-engine.service';
import { DEFAULT_SETTINGS, GestureFrameSnapshot } from '../models/gesture.model';
import { SceneSummary, SceneApplyResult } from '../models/scene.model';

function createBaseSnapshot(overrides: Partial<GestureFrameSnapshot> = {}): GestureFrameSnapshot {
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
    handsMirrored: [],
    isScrolling: false,
    scrollDelta: 0,
    ...overrides
  };
}

describe('WaveViewModelStore', () => {
  let store: WaveViewModelStore;
  let injector: EnvironmentInjector;
  let mockApiService: {
    liveControl: ReturnType<typeof signal<boolean>>;
    connectionState: ReturnType<typeof signal<'checking' | 'connected' | 'unreachable'>>;
    activeWindow: ReturnType<typeof signal<{ handle: number; title: string; processName: string } | null>>;
    recentWindows: ReturnType<typeof signal<never[]>>;
    lastSnapResult: ReturnType<typeof signal<{ success: boolean; message: string } | null>>;
    setLiveControl: ReturnType<typeof vi.fn>;
    toggleLiveControl: ReturnType<typeof vi.fn>;
    grabWindow: ReturnType<typeof vi.fn>;
    moveWindow: ReturnType<typeof vi.fn>;
    snapWindow: ReturnType<typeof vi.fn>;
    resizeWindow: ReturnType<typeof vi.fn>;
    cycleWindow: ReturnType<typeof vi.fn>;
    scrollInput: ReturnType<typeof vi.fn>;
    checkHealth: ReturnType<typeof vi.fn>;
  };
  let mockSceneApiService: {
    getScenes: ReturnType<typeof vi.fn>;
    getOpenWindows: ReturnType<typeof vi.fn>;
    captureScene: ReturnType<typeof vi.fn>;
    updateScene: ReturnType<typeof vi.fn>;
    deleteScene: ReturnType<typeof vi.fn>;
    applyScene: ReturnType<typeof vi.fn>;
    undoLastApply: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    const liveSig = signal(false);
    mockApiService = {
      liveControl: liveSig,
      connectionState: signal<'checking' | 'connected' | 'unreachable'>('connected'),
      activeWindow: signal({ handle: 101, title: 'Notepad', processName: 'notepad' }),
      recentWindows: signal([]),
      lastSnapResult: signal(null),
      setLiveControl: vi.fn((val: boolean) => liveSig.set(val)),
      toggleLiveControl: vi.fn(() => liveSig.set(!liveSig())),
      grabWindow: vi.fn(() => Promise.resolve(null)),
      moveWindow: vi.fn(() => Promise.resolve(null)),
      snapWindow: vi.fn(() => Promise.resolve(null)),
      resizeWindow: vi.fn(() => Promise.resolve(null)),
      cycleWindow: vi.fn(() => Promise.resolve(null)),
      scrollInput: vi.fn(() => Promise.resolve(null)),
      checkHealth: vi.fn(() => of(true))
    };

    mockSceneApiService = {
      getScenes: vi.fn(() => Promise.resolve<SceneSummary[]>([])),
      getOpenWindows: vi.fn(() => Promise.resolve([])),
      captureScene: vi.fn(() => Promise.resolve<SceneSummary>({
        id: 'scene-1',
        name: 'Work Layout',
        gestureFingers: 3,
        createdAt: new Date().toISOString(),
        windowCount: 2,
        windows: []
      })),
      updateScene: vi.fn(() => Promise.resolve<SceneSummary>({
        id: 'scene-1',
        name: 'Work Layout Updated',
        gestureFingers: 3,
        createdAt: new Date().toISOString(),
        windowCount: 2,
        windows: []
      })),
      deleteScene: vi.fn(() => Promise.resolve(true)),
      applyScene: vi.fn((scene: SceneSummary) => Promise.resolve<SceneApplyResult>({
        scene,
        restored: [{ processName: 'notepad', className: 'Notepad', rect: { x: 0, y: 0, w: 0.5, h: 1 } }],
        missing: [],
        failed: [],
        durationMs: 42
      })),
      undoLastApply: vi.fn(() => Promise.resolve({ success: true, message: 'Layout restored.' }))
    };

    injector = createEnvironmentInjector(
      [
        WaveViewModelStore,
        SettingsService,
        GestureEngineService,
        {
          provide: NgZone,
          useValue: {
            run: <T>(fn: () => T) => fn(),
            runOutsideAngular: <T>(fn: () => T) => fn()
          }
        },
        { provide: WindowApiService, useValue: mockApiService },
        { provide: SceneApiService, useValue: mockSceneApiService },
        {
          provide: CameraService,
          useValue: {
            state: signal('idle'),
            errorMessage: signal(null),
            startCamera: vi.fn(() => Promise.resolve(true)),
            stopCamera: vi.fn()
          }
        },
        {
          provide: HandTrackerService,
          useValue: {
            status: signal('uninitialized'),
            delegateUsed: signal('GPU'),
            initialize: vi.fn(() => Promise.resolve(true)),
            startTrackingLoop: vi.fn(),
            stopTrackingLoop: vi.fn()
          }
        }
      ],
      null as unknown as EnvironmentInjector
    );

    store = injector.get(WaveViewModelStore);
    store.resetPractice();
  });

  it('exposes the 5 adapted W.A.V.E gesture cards and starts with Live control OFF', () => {
    expect(PRACTICE_GESTURE_CARDS.map((c) => c.id)).toEqual(['hover', 'grab', 'snap', 'scroll', 'switch']);
    expect(store.liveControl()).toBe(false);
    expect(store.gestureState()).toBe('IDLE');
    expect(store.practiceCompletedCount()).toBe(0);
    expect(store.stateMeta().chip).toBe('IDLE');
  });

  it('automatically ticks Hover, Grab, Snap to edge, Scroll, and Switch in practiceProgress and resets cleanly', () => {
    // 1. Hover
    store.applyGestureSnapshot(
      createBaseSnapshot({ state: 'HOVER', cursor: { x: 0.5, y: 0.5 } })
    );
    expect(store.practiceProgress().hover).toBe(true);
    expect(store.practiceCompletedCount()).toBe(1);

    // 2. Grab
    store.applyGestureSnapshot(
      createBaseSnapshot({
        state: 'GRABBING',
        isPinching: true,
        cursor: { x: 0.5, y: 0.5 },
        grabIssued: { x: 0.5, y: 0.5 }
      })
    );
    expect(store.practiceProgress().grab).toBe(true);
    expect(store.practiceCompletedCount()).toBe(2);
    expect(mockApiService.grabWindow).toHaveBeenCalledWith({ x: 0.5, y: 0.5 });

    // 3. Snap to edge
    store.applyGestureSnapshot(
      createBaseSnapshot({
        state: 'RELEASED',
        snapIssued: { position: 'left', ratio: DEFAULT_SETTINGS.snapRatio }
      })
    );
    expect(store.practiceProgress().snap).toBe(true);
    expect(store.practiceCompletedCount()).toBe(3);
    expect(mockApiService.snapWindow).toHaveBeenCalledWith({
      position: 'left',
      ratio: DEFAULT_SETTINGS.snapRatio
    });

    // 4. V-Sign Scroll
    expect(store.practiceCollapsed()).toBe(false);
    store.applyGestureSnapshot(
      createBaseSnapshot({
        state: 'SCROLLING',
        isScrolling: true,
        scrollDelta: 180,
        scrollIssued: { delta: 180 }
      })
    );
    expect(store.practiceProgress().scroll).toBe(true);
    expect(store.practiceCompletedCount()).toBe(4);
    expect(store.practiceCollapsed()).toBe(false);
    expect(store.stateMeta().chip).toBe('SCROLL');
    expect(mockApiService.scrollInput).toHaveBeenCalledWith({ delta: 180 });

    // 5. Window Switch
    store.applyGestureSnapshot(
      createBaseSnapshot({
        state: 'HOVER',
        cycleIssued: { direction: 'next' }
      })
    );
    expect(store.practiceProgress().switch).toBe(true);
    expect(store.practiceCompletedCount()).toBe(5);
    expect(store.practiceCollapsed()).toBe(true);
    expect(mockApiService.cycleWindow).toHaveBeenCalledWith({ direction: 'next' });

    // Reset practice checklist
    store.resetPractice();
    expect(store.practiceCompletedCount()).toBe(0);
    expect(store.practiceCollapsed()).toBe(false);
    expect(store.practiceProgress()).toEqual({
      hover: false,
      grab: false,
      snap: false,
      scroll: false,
      switch: false
    });
  });

  it('toggles Live control and updates ariaAnnouncement', () => {
    expect(store.liveControl()).toBe(false);
    store.toggleLiveControl();
    expect(store.liveControl()).toBe(true);
    expect(store.ariaAnnouncement()).toContain('Live control enabled');

    store.toggleLiveControl();
    expect(store.liveControl()).toBe(false);
    expect(store.ariaAnnouncement()).toContain('Practice mode active');
  });

  it('manages Wave Scenes drawer, modal state, loading, apply, and undo', async () => {
    expect(store.scenesEnabled()).toBe(true);
    expect(store.scenesOpen()).toBe(false);
    expect(store.undoAvailable()).toBe(false);

    // Toggle drawer
    store.toggleScenesDrawer(true);
    expect(store.scenesOpen()).toBe(true);
    expect(mockSceneApiService.getScenes).toHaveBeenCalled();

    // Toggle capture modal
    store.toggleSaveSceneModal(true);
    expect(store.saveSceneModalOpen()).toBe(true);
    store.toggleSaveSceneModal(false);
    expect(store.saveSceneModalOpen()).toBe(false);

    // Capture scene
    await store.captureCurrentScene('Coding Layout', 3);
    expect(mockSceneApiService.captureScene).toHaveBeenCalledWith({
      name: 'Coding Layout',
      gestureFingers: 3
    });
    expect(store.scenes().length).toBe(1);
    expect(store.scenes()[0].name).toBe('Work Layout');

    // Apply scene
    await store.applyScene(store.scenes()[0]);
    expect(mockSceneApiService.applyScene).toHaveBeenCalledWith(store.scenes()[0]);
    expect(store.undoAvailable()).toBe(true);
    expect(store.lastSceneResult()?.scene.name).toBe('Work Layout');

    // Undo scene
    await store.undoLastScene();
    expect(mockSceneApiService.undoLastApply).toHaveBeenCalled();
    expect(store.undoAvailable()).toBe(false);

    // Trigger scene gesture 3 (mapped)
    await store.triggerSceneGesture(3);
    expect(mockSceneApiService.applyScene).toHaveBeenCalledWith(store.scenes()[0]);

    // Trigger scene gesture 4 (unmapped)
    await store.triggerSceneGesture(4);
    expect(store.toasts().some((t) => t.title.includes('Shaka sign detected'))).toBe(true);
  });
});
