import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ActiveWindowInfo,
  CyclePayload,
  GrabPayload,
  MovePayload,
  ResizePayload,
  ScrollPayload,
  ScrollResponse,
  SnapPayload,
  SnapResult
} from '../models/snap-action.model';

export type BackendConnectionState = 'checking' | 'connected' | 'unreachable';

@Injectable({ providedIn: 'root' })
export class WindowApiService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly connectionState = signal<BackendConnectionState>('checking');
  readonly activeWindow = signal<ActiveWindowInfo | null>(null);
  readonly recentWindows = signal<ActiveWindowInfo[]>([]);
  readonly lastSnapResult = signal<SnapResult | null>(null);

  /**
   * Authoritative Live Control gate (default false = Practice Mode).
   * When false, all window grab, move, snap, resize, cycle, and scroll commands
   * are blocked from reaching Windows while health polling and the HUD continue running.
   */
  readonly liveControl = signal<boolean>(false);

  private pollHandle: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHealthPolling();
    this.destroyRef.onDestroy(() => this.stopHealthPolling());
  }

  setLiveControl(enabled: boolean): void {
    this.liveControl.set(enabled);
  }

  toggleLiveControl(): void {
    this.liveControl.update((v) => !v);
  }

  startHealthPolling(): void {
    this.stopHealthPolling();
    void this.checkHealthAndActiveWindow();
    this.pollHandle = setInterval(() => {
      void this.checkHealthAndActiveWindow();
    }, 2500);
  }

  stopHealthPolling(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  async checkHealthAndActiveWindow(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ status: string }>(environment.healthUrl).pipe(
          timeout(4000),
          catchError(() => of(null))
        )
      );

      if (res && res.status === 'ok') {
        this.connectionState.set('connected');
        const active = await firstValueFrom(
          this.http.get<ActiveWindowInfo>(`${environment.apiBaseUrl}/active`).pipe(
            timeout(3000),
            catchError(() => of(null))
          )
        );
        if (active) {
          this.activeWindow.set(active);
        }
        const list = await firstValueFrom(
          this.http.get<ActiveWindowInfo[]>(`${environment.apiBaseUrl}/list`).pipe(
            timeout(3000),
            catchError(() => of(null))
          )
        );
        if (list) {
          this.recentWindows.set(list);
        }
      } else {
        this.connectionState.set('unreachable');
      }
    } catch {
      this.connectionState.set('unreachable');
    }
  }

  async grabWindow(payload: GrabPayload): Promise<SnapResult | null> {
    if (!this.liveControl()) {
      const practiceRes: SnapResult = {
        success: true,
        windowTitle: this.activeWindow()?.title || 'Practice Window',
        appliedRect: null,
        message: 'Practice grab (Live control off).'
      };
      this.lastSnapResult.set(practiceRes);
      return practiceRes;
    }

    try {
      const res = await firstValueFrom(
        this.http.post<SnapResult>(`${environment.apiBaseUrl}/grab`, payload).pipe(
          timeout(3000),
          catchError((err) =>
            of<SnapResult>({
              success: false,
              windowTitle: '',
              appliedRect: null,
              message: err?.error?.message || 'Backend unreachable during grab.'
            })
          )
        )
      );
      this.lastSnapResult.set(res);
      return res;
    } catch {
      return null;
    }
  }

  async moveWindow(payload: MovePayload): Promise<SnapResult | null> {
    if (!this.liveControl()) {
      return null;
    }

    try {
      return await firstValueFrom(
        this.http.post<SnapResult>(`${environment.apiBaseUrl}/move`, payload).pipe(
          timeout(1200),
          catchError(() => of(null))
        )
      );
    } catch {
      return null;
    }
  }

  async snapWindow(payload: SnapPayload): Promise<SnapResult | null> {
    if (!this.liveControl()) {
      const practiceRes: SnapResult = {
        success: true,
        windowTitle: this.activeWindow()?.title || 'Practice Window',
        appliedRect: null,
        message: `Practice snap ${payload.position} (Live control off).`
      };
      this.lastSnapResult.set(practiceRes);
      return practiceRes;
    }

    try {
      const res = await firstValueFrom(
        this.http.post<SnapResult>(`${environment.apiBaseUrl}/snap`, payload).pipe(
          timeout(3000),
          catchError((err) =>
            of<SnapResult>({
              success: false,
              windowTitle: '',
              appliedRect: null,
              message: err?.error?.message || 'Backend unreachable during snap.'
            })
          )
        )
      );
      this.lastSnapResult.set(res);
      void this.checkHealthAndActiveWindow();
      return res;
    } catch {
      return null;
    }
  }

  async resizeWindow(payload: ResizePayload): Promise<SnapResult | null> {
    if (!this.liveControl()) {
      const practiceRes: SnapResult = {
        success: true,
        windowTitle: this.activeWindow()?.title || 'Practice Window',
        appliedRect: null,
        message: `Practice resize ${payload.scaleFactor.toFixed(2)}x (Live control off).`
      };
      this.lastSnapResult.set(practiceRes);
      return practiceRes;
    }

    try {
      const res = await firstValueFrom(
        this.http.post<SnapResult>(`${environment.apiBaseUrl}/resize`, payload).pipe(
          timeout(2500),
          catchError(() => of(null))
        )
      );
      if (res) {
        this.lastSnapResult.set(res);
      }
      return res;
    } catch {
      return null;
    }
  }

  async cycleWindow(payload: CyclePayload): Promise<SnapResult | null> {
    if (!this.liveControl()) {
      const practiceRes: SnapResult = {
        success: true,
        windowTitle: this.activeWindow()?.title || 'Practice Window',
        appliedRect: null,
        message: `Practice cycle ${payload.direction} (Live control off).`
      };
      this.lastSnapResult.set(practiceRes);
      return practiceRes;
    }

    try {
      const res = await firstValueFrom(
        this.http.post<SnapResult>(`${environment.apiBaseUrl}/cycle`, payload).pipe(
          timeout(2500),
          catchError(() => of(null))
        )
      );
      if (res) {
        this.lastSnapResult.set(res);
        void this.checkHealthAndActiveWindow();
      }
      return res;
    } catch {
      return null;
    }
  }

  async scrollInput(payload: ScrollPayload): Promise<ScrollResponse | null> {
    if (!this.liveControl()) {
      if (payload.delta !== 0) {
        this.lastSnapResult.set({
          success: true,
          windowTitle: this.activeWindow()?.title || 'Practice Window',
          appliedRect: null,
          message: `Practice scroll ${payload.delta > 0 ? 'up' : 'down'} (${payload.delta > 0 ? '+' : ''}${payload.delta}).`
        });
      }
      return { success: true };
    }

    const requestBody: ScrollPayload = payload.begin
      ? {
          delta: payload.delta ?? 0,
          begin: true,
          x: payload.x,
          y: payload.y
        }
      : {
          delta: payload.delta
        };

    try {
      const res = await firstValueFrom(
        this.http.post<ScrollResponse>(environment.scrollUrl, requestBody).pipe(
          timeout(1500),
          catchError(() => of(null))
        )
      );
      if (res?.success && payload.delta !== 0) {
        this.lastSnapResult.set({
          success: true,
          windowTitle: this.activeWindow()?.title || '',
          appliedRect: null,
          message: `Scrolled ${payload.delta > 0 ? 'up' : 'down'} (${payload.delta > 0 ? '+' : ''}${payload.delta})`
        });
      }
      return res;
    } catch {
      return null;
    }
  }
}
