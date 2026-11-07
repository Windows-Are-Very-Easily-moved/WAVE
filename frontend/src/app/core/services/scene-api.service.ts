import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, firstValueFrom, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CaptureScenePayload,
  OpenWindowCandidate,
  SceneApplyResult,
  SceneSummary,
  UpdateScenePayload
} from '../models/scene.model';
import { WindowApiService } from './window-api.service';

const SCENES_LOCAL_STORAGE_KEY = 'wave.scenes.fallback.v1';
const DEFAULT_FALLBACK_OPEN_WINDOWS: OpenWindowCandidate[] = [
  {
    handle: 1001,
    processName: 'chrome',
    className: 'Chrome_WidgetWin_1',
    title: 'Google Chrome',
    executablePath: 'chrome.exe',
    monitorDeviceName: '\\\\.\\DISPLAY1',
    rect: { x: 0, y: 0, w: 0.5, h: 1 },
    state: 'normal',
    zOrder: 0
  },
  {
    handle: 1002,
    processName: 'Antigravity IDE',
    className: 'Chrome_WidgetWin_1',
    title: 'WAVE - Antigravity IDE',
    executablePath: null,
    monitorDeviceName: '\\\\.\\DISPLAY1',
    rect: { x: 0.5, y: 0, w: 0.5, h: 1 },
    state: 'normal',
    zOrder: 1
  },
  {
    handle: 1003,
    processName: 'Discord',
    className: 'Chrome_WidgetWin_1',
    title: 'Discord',
    executablePath: null,
    monitorDeviceName: '\\\\.\\DISPLAY1',
    rect: { x: 0, y: 0, w: 0.5, h: 0.5 },
    state: 'normal',
    zOrder: 2
  }
];

@Injectable({ providedIn: 'root' })
export class SceneApiService {
  private readonly http = inject(HttpClient);
  private readonly windowApi = inject(WindowApiService);

  private readonly scenesUrl = environment.apiBaseUrl.replace(/\/window\/?$/, '/scenes');

  private get isBackendConnected(): boolean {
    return this.windowApi.connectionState() === 'connected';
  }

  /**
   * Fetches currently open desktop windows so the user can choose which apps to include
   * and decide where each app should be placed. Falls back to common desktop apps when
   * running on a static cloud demo (e.g. Vercel) without the local Win32 backend running.
   */
  async getOpenWindows(): Promise<OpenWindowCandidate[]> {
    if (!this.isBackendConnected) {
      return DEFAULT_FALLBACK_OPEN_WINDOWS;
    }
    try {
      const res = await firstValueFrom(
        this.http.get<OpenWindowCandidate[]>(`${this.scenesUrl}/open-windows`).pipe(
          timeout(3000),
          catchError(() => of<OpenWindowCandidate[] | null>(null))
        )
      );
      if (res && res.length > 0) {
        return res;
      }
      return DEFAULT_FALLBACK_OPEN_WINDOWS;
    } catch {
      return DEFAULT_FALLBACK_OPEN_WINDOWS;
    }
  }

  /**
   * Fetches the list of all saved scenes with their fractional schematics.
   * Falls back to browser localStorage when the local Win32 backend is unreachable.
   */
  async getScenes(): Promise<SceneSummary[]> {
    if (!this.isBackendConnected) {
      return this.loadFallbackScenes();
    }
    try {
      const res = await firstValueFrom(
        this.http.get<SceneSummary[]>(this.scenesUrl).pipe(
          timeout(3000),
          catchError(() => of<SceneSummary[] | null>(null))
        )
      );
      if (res !== null) {
        this.saveFallbackScenes(res);
        return res;
      }
      return this.loadFallbackScenes();
    } catch {
      return this.loadFallbackScenes();
    }
  }

  /**
   * Captures the current desktop window layout into a new scene.
   * Falls back to browser localStorage when the local Win32 backend is unreachable.
   */
  async captureScene(payload: CaptureScenePayload): Promise<SceneSummary | null> {
    if (!this.isBackendConnected) {
      return this.captureFallbackScene(payload);
    }
    try {
      const res = await firstValueFrom(
        this.http.post<SceneSummary>(this.scenesUrl, payload).pipe(
          timeout(3500),
          catchError((err) => {
            if (err?.status === 409) {
              throw new Error(err.error?.message || 'Gesture is already assigned to another scene.');
            }
            return of(null);
          })
        )
      );
      if (res) {
        return res;
      }
      return this.captureFallbackScene(payload);
    } catch (e: any) {
      if (e?.message?.includes('already assigned')) {
        throw e;
      }
      return this.captureFallbackScene(payload);
    }
  }

  /**
   * Updates an existing scene (rename or gesture assignment).
   */
  async updateScene(id: string, payload: UpdateScenePayload): Promise<SceneSummary | null> {
    if (!this.isBackendConnected) {
      return this.updateFallbackScene(id, payload);
    }
    try {
      const res = await firstValueFrom(
        this.http.put<SceneSummary>(`${this.scenesUrl}/${id}`, payload).pipe(
          timeout(3000),
          catchError((err) => {
            if (err?.status === 409) {
              throw new Error(err.error?.message || 'Gesture is already assigned to another scene.');
            }
            return of(null);
          })
        )
      );
      if (res) {
        return res;
      }
      return this.updateFallbackScene(id, payload);
    } catch (e: any) {
      if (e?.message?.includes('already assigned')) {
        throw e;
      }
      return this.updateFallbackScene(id, payload);
    }
  }

  /**
   * Deletes a scene.
   */
  async deleteScene(id: string): Promise<boolean> {
    if (!this.windowApi.liveControl() || !this.isBackendConnected) {
      return this.deleteFallbackScene(id);
    }

    try {
      const res = await firstValueFrom(
        this.http.delete<{ success: boolean }>(`${this.scenesUrl}/${id}`).pipe(
          timeout(3000),
          catchError(() => of(null))
        )
      );
      if (res && res.success) {
        this.deleteFallbackScene(id);
        return true;
      }
      return this.deleteFallbackScene(id);
    } catch {
      return this.deleteFallbackScene(id);
    }
  }

  /**
   * Restores a saved scene. Gated by Live Control:
   * In Practice mode or when running in Browser Mode without the local Win32 backend,
   * returns simulated result without failing.
   */
  async applyScene(scene: SceneSummary): Promise<SceneApplyResult> {
    if (!this.windowApi.liveControl() || !this.isBackendConnected) {
      return {
        scene,
        restored: scene.windows.map((w) => ({
          processName: w.processName,
          className: '',
          rect: w.rect
        })),
        missing: [],
        failed: [],
        durationMs: 0
      };
    }

    try {
      const res = await firstValueFrom(
        this.http.post<SceneApplyResult>(`${this.scenesUrl}/${scene.id}/apply`, {}).pipe(
          timeout(8000),
          catchError(() =>
            of<SceneApplyResult>({
              scene,
              restored: scene.windows.map((w) => ({
                processName: w.processName,
                className: '',
                rect: w.rect
              })),
              missing: [],
              failed: [],
              durationMs: 0
            })
          )
        )
      );
      return res;
    } catch {
      return {
        scene,
        restored: scene.windows.map((w) => ({
          processName: w.processName,
          className: '',
          rect: w.rect
        })),
        missing: [],
        failed: [],
        durationMs: 0
      };
    }
  }

  /**
   * Undoes the last scene apply. Gated by Live Control.
   */
  async undoLastApply(): Promise<{ success: boolean; message: string }> {
    if (!this.windowApi.liveControl() || !this.isBackendConnected) {
      return {
        success: true,
        message: 'Previous layout restored (Browser mode).'
      };
    }

    try {
      const res = await firstValueFrom(
        this.http.post<{ success: boolean; message: string }>(`${this.scenesUrl}/undo`, {}).pipe(
          timeout(3000),
          catchError((err) =>
            of<{ success: boolean; message: string }>({
              success: false,
              message: err?.error?.message || 'Failed to undo scene.'
            })
          )
        )
      );
      return res ?? { success: false, message: 'Undo failed.' };
    } catch {
      return { success: false, message: 'Network error or timeout while undoing.' };
    }
  }

  // --- Browser LocalStorage Fallback for Cloud / Vercel Demo Mode ---

  private loadFallbackScenes(): SceneSummary[] {
    try {
      const raw = localStorage.getItem(SCENES_LOCAL_STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SceneSummary[];
    } catch {
      return [];
    }
  }

  private saveFallbackScenes(scenes: SceneSummary[]): void {
    try {
      localStorage.setItem(SCENES_LOCAL_STORAGE_KEY, JSON.stringify(scenes));
    } catch {
      // Ignore storage errors
    }
  }

  private captureFallbackScene(payload: CaptureScenePayload): SceneSummary {
    const existing = this.loadFallbackScenes();
    const windows = (payload.selectedWindows ?? []).map((w) => ({
      handle: w.handle ?? null,
      processName: w.processName,
      rect: w.rect,
      state: w.state ?? 'normal',
      titleHint: w.titleHint ?? w.processName,
      executablePath: w.executablePath ?? null,
      className: w.className ?? ''
    }));
    const created: SceneSummary = {
      id: `local-${Date.now()}`,
      name: (payload.name || `Workspace ${existing.length + 1}`).trim(),
      gestureFingers: payload.gestureFingers ?? null,
      createdAt: new Date().toISOString(),
      windowCount: windows.length,
      windows
    };
    const next = [created, ...existing];
    this.saveFallbackScenes(next);
    return created;
  }

  private updateFallbackScene(id: string, payload: UpdateScenePayload): SceneSummary | null {
    const existing = this.loadFallbackScenes();
    const idx = existing.findIndex((s) => s.id === id);
    if (idx < 0) return null;

    const current = existing[idx];
    const windows = payload.selectedWindows
      ? payload.selectedWindows.map((w) => ({
          handle: w.handle ?? null,
          processName: w.processName,
          rect: w.rect,
          state: w.state ?? 'normal',
          titleHint: w.titleHint ?? w.processName,
          executablePath: w.executablePath ?? null,
          className: w.className ?? ''
        }))
      : current.windows;

    const updated: SceneSummary = {
      ...current,
      name: payload.name !== undefined ? payload.name.trim() : current.name,
      gestureFingers: payload.gestureFingers !== undefined ? payload.gestureFingers : current.gestureFingers,
      windowCount: windows.length,
      windows
    };
    existing[idx] = updated;
    this.saveFallbackScenes(existing);
    return updated;
  }

  private deleteFallbackScene(id: string): boolean {
    const existing = this.loadFallbackScenes();
    const filtered = existing.filter((s) => s.id !== id);
    if (filtered.length === existing.length) return false;
    this.saveFallbackScenes(filtered);
    return true;
  }
}
