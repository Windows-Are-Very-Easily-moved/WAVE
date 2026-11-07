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

@Injectable({ providedIn: 'root' })
export class SceneApiService {
  private readonly http = inject(HttpClient);
  private readonly windowApi = inject(WindowApiService);

  private readonly scenesUrl = environment.apiBaseUrl.replace(/\/window\/?$/, '/scenes');

  /**
   * Fetches currently open desktop windows so the user can choose which apps to include
   * and decide where each app should be placed.
   */
  async getOpenWindows(): Promise<OpenWindowCandidate[]> {
    try {
      const res = await firstValueFrom(
        this.http.get<OpenWindowCandidate[]>(`${this.scenesUrl}/open-windows`).pipe(
          timeout(3000),
          catchError(() => of<OpenWindowCandidate[]>([]))
        )
      );
      return res ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Fetches the list of all saved scenes with their fractional schematics.
   * Runs in both Practice and Live modes because it is read-only.
   */
  async getScenes(): Promise<SceneSummary[]> {
    try {
      const res = await firstValueFrom(
        this.http.get<SceneSummary[]>(this.scenesUrl).pipe(
          timeout(3000),
          catchError(() => of<SceneSummary[]>([]))
        )
      );
      return res ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Captures the current desktop window layout into a new scene.
   * Runs in both Practice and Live modes because reading layout is non-destructive.
   */
  async captureScene(payload: CaptureScenePayload): Promise<SceneSummary | null> {
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
      return res;
    } catch (e: any) {
      if (e?.message?.includes('already assigned')) {
        throw e;
      }
      return null;
    }
  }

  /**
   * Updates an existing scene (rename or gesture assignment).
   */
  async updateScene(id: string, payload: UpdateScenePayload): Promise<SceneSummary | null> {
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
      return res;
    } catch (e: any) {
      if (e?.message?.includes('already assigned')) {
        throw e;
      }
      return null;
    }
  }

  /**
   * Deletes a scene. Gated by Live Control: in Practice mode, it blocks destructive deletion.
   */
  async deleteScene(id: string): Promise<boolean> {
    if (!this.windowApi.liveControl()) {
      return false;
    }

    try {
      const res = await firstValueFrom(
        this.http.delete<{ success: boolean }>(`${this.scenesUrl}/${id}`).pipe(
          timeout(3000),
          catchError(() => of({ success: false }))
        )
      );
      return Boolean(res?.success);
    } catch {
      return false;
    }
  }

  /**
   * Restores a saved scene. Gated by Live Control:
   * In Practice mode, returns simulated result without moving real OS windows.
   */
  async applyScene(scene: SceneSummary): Promise<SceneApplyResult> {
    if (!this.windowApi.liveControl()) {
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
          catchError((err) =>
            of<SceneApplyResult>({
              scene,
              restored: [],
              missing: [],
              failed: [{
                processName: 'all',
                className: '',
                reason: err?.error?.message || 'Failed to communicate with Scenes API.'
              }],
              durationMs: 0
            })
          )
        )
      );
      return res;
    } catch {
      return {
        scene,
        restored: [],
        missing: [],
        failed: [{ processName: 'all', className: '', reason: 'Network error or timeout' }],
        durationMs: 0
      };
    }
  }

  /**
   * Undoes the last scene apply. Gated by Live Control.
   */
  async undoLastApply(): Promise<{ success: boolean; message: string }> {
    if (!this.windowApi.liveControl()) {
      return {
        success: true,
        message: 'Practice mode — simulated undo (no windows moved).'
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
}
