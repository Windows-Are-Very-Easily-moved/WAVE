import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';
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
  private readonly ngZone = inject(NgZone, { optional: true });

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
  private moveInFlight = false;
  private scrollInFlight = false;
  private pendingScrollDelta = 0;

  constructor() {
    this.startHealthPolling();
    this.destroyRef.onDestroy(() => this.stopHealthPolling());
  }

  setLiveControl(enabled: boolean): void {
    this.liveControl.set(enabled);
    if (enabled) {
      void this.checkHealthAndActiveWindow();
    }
  }

  toggleLiveControl(): void {
    this.setLiveControl(!this.liveControl());
  }

  startHealthPolling(): void {
    this.stopHealthPolling();
    const startLoop = () => {
      void this.checkHealthAndActiveWindow();
      this.pollHandle = setInterval(() => {
        // When hosted on a remote domain (e.g. *.vercel.app), only poll continuously if the local
        // desktop agent is actually connected, avoiding repeated ERR_CONNECTION_REFUSED logs on visitor machines.
        const isLocalhost =
          typeof window === 'undefined' ||
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1';
        if (isLocalhost || this.connectionState() === 'connected') {
          void this.checkHealthAndActiveWindow();
        }
      }, 3000);
    };
    if (this.ngZone) {
      this.ngZone.runOutsideAngular(startLoop);
    } else {
      startLoop();
    }
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
          timeout(3000),
          catchError(() => of(null))
        )
      );

      if (res && res.status === 'ok') {
        if (this.connectionState() !== 'connected') {
          this.runInZone(() => this.connectionState.set('connected'));
        }
        const active = await firstValueFrom(
          this.http.get<ActiveWindowInfo>(`${environment.apiBaseUrl}/active`).pipe(
            timeout(2500),
            catchError(() => of(null))
          )
        );
        if (active) {
          const prev = this.activeWindow();
          if (!prev || prev.handle !== active.handle || prev.title !== active.title) {
            this.runInZone(() => this.activeWindow.set(active));
          }
        }
      } else if (this.connectionState() !== 'unreachable') {
        this.runInZone(() => this.connectionState.set('unreachable'));
      }
    } catch {
      if (this.connectionState() !== 'unreachable') {
        this.runInZone(() => this.connectionState.set('unreachable'));
      }
    }
  }

  private runInZone(fn: () => void): void {
    if (this.ngZone) {
      this.ngZone.run(fn);
    } else {
      fn();
    }
  }

  async grabWindow(payload: GrabPayload): Promise<SnapResult | null> {
    if (!this.liveControl() || this.connectionState() !== 'connected') {
      const practiceRes: SnapResult = {
        success: true,
        windowTitle: this.activeWindow()?.title || 'Browser Window',
        appliedRect: null,
        message: this.liveControl()
          ? 'Browser mode grab (no local desktop agent).'
          : 'Practice grab (Live control off).'
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
    if (!this.liveControl() || this.connectionState() !== 'connected' || this.moveInFlight) {
      return null;
    }

    this.moveInFlight = true;
    try {
      return await firstValueFrom(
        this.http.post<SnapResult>(`${environment.apiBaseUrl}/move`, payload).pipe(
          timeout(1000),
          catchError(() => of(null))
        )
      );
    } catch {
      return null;
    } finally {
      this.moveInFlight = false;
    }
  }

  async snapWindow(payload: SnapPayload): Promise<SnapResult | null> {
    if (!this.liveControl() || this.connectionState() !== 'connected') {
      const practiceRes: SnapResult = {
        success: true,
        windowTitle: this.activeWindow()?.title || 'Browser Window',
        appliedRect: null,
        message: this.liveControl()
          ? `Snapped ${payload.position} (Browser mode).`
          : `Practice snap ${payload.position} (Live control off).`
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
    if (!this.liveControl() || this.connectionState() !== 'connected') {
      const practiceRes: SnapResult = {
        success: true,
        windowTitle: this.activeWindow()?.title || 'Browser Window',
        appliedRect: null,
        message: `Resized ${payload.scaleFactor.toFixed(2)}x`
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
    if (!this.liveControl() || this.connectionState() !== 'connected') {
      const practiceRes: SnapResult = {
        success: true,
        windowTitle: this.activeWindow()?.title || 'Browser Window',
        appliedRect: null,
        message: `Switched window (${payload.direction})`
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
    if (!this.liveControl() || this.connectionState() !== 'connected') {
      return { success: true };
    }

    // Coalesce rapid scroll deltas if a previous HTTP scroll request is still in flight
    if (this.scrollInFlight && !payload.begin) {
      this.pendingScrollDelta = Math.max(
        -1200,
        Math.min(1200, this.pendingScrollDelta + payload.delta)
      );
      return { success: true };
    }

    const totalDelta = Math.max(
      -1200,
      Math.min(1200, (payload.delta ?? 0) + this.pendingScrollDelta)
    );
    this.pendingScrollDelta = 0;

    const requestBody: ScrollPayload = payload.begin
      ? {
          delta: totalDelta,
          begin: true,
          x: payload.x,
          y: payload.y
        }
      : {
          delta: totalDelta
        };

    this.scrollInFlight = true;
    try {
      return await firstValueFrom(
        this.http.post<ScrollResponse>(environment.scrollUrl, requestBody).pipe(
          timeout(1200),
          catchError(() => of(null))
        )
      );
    } catch {
      return null;
    } finally {
      this.scrollInFlight = false;
      if (this.pendingScrollDelta !== 0 && this.liveControl()) {
        const nextDelta = this.pendingScrollDelta;
        this.pendingScrollDelta = 0;
        void this.scrollInput({ delta: nextDelta });
      }
    }
  }
}
