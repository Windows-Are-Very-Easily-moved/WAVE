import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  ViewChild,
  effect,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CameraService } from '../../core/services/camera.service';
import { HandTrackerService } from '../../core/services/hand-tracker.service';
import { GestureEngineService } from '../../core/services/gesture-engine.service';
import { WindowApiService } from '../../core/services/window-api.service';
import { SettingsService } from '../../core/services/settings.service';
import { GestureFrameSnapshot } from '../../core/models/gesture.model';
import { Point2D } from '../../core/models/landmark.model';
import { SnapPosition } from '../../core/models/snap-action.model';
import { HudOverlayComponent } from '../hud-overlay/hud-overlay.component';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component';

@Component({
  selector: 'app-scepter-shell',
  standalone: true,
  imports: [CommonModule, HudOverlayComponent, SettingsPanelComponent],
  template: `
    <div class="scepter-app" [class.compact-mode]="compactMode()">
      <!-- Top Regal Header -->
      <header class="top-bar glass-panel">
        <div class="brand">
          <div class="crown-emblem" aria-hidden="true">
            <svg viewBox="0 0 36 36" width="26" height="26">
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#ffe6a3" />
                  <stop offset="50%" stop-color="#f5b942" />
                  <stop offset="100%" stop-color="#c88a14" />
                </linearGradient>
              </defs>
              <path
                fill="url(#goldGrad)"
                d="M4 26L7.5 11l6.5 6.5L18 6l4 11.5L28.5 11 32 26H4zm1 3h26v2.5H5V29z"
              />
              <circle cx="18" cy="4.2" r="2" fill="#fff3c4" />
            </svg>
          </div>
          <div class="brand-text">
            <h1>W.A.V.E <span class="hud-tag">HUD</span></h1>
            <p class="tagline">Windows Are Very Easily-moved</p>
          </div>
        </div>

        <!-- Status Chips -->
        <div class="status-strip">
          <!-- Gesture State Chip -->
          <div class="chip state-chip" [attr.data-state]="frame().state">
            <span class="dot"></span>
            <span class="label">STATE:</span>
            <strong>{{ frame().state === 'SCROLLING' ? 'SCROLL' : frame().state }}</strong>
          </div>

          <!-- FPS Counter -->
          <div class="chip fps-chip">
            <span class="label">FPS:</span>
            <strong>{{ fps() }}</strong>
            <span class="sub-badge" *ngIf="!simulationMode()">{{ trackerService.delegateUsed() }}</span>
            <span class="sub-badge sim" *ngIf="simulationMode()">SIM</span>
          </div>

          <!-- Backend Connection Status -->
          <div
            class="chip conn-chip"
            [class.connected]="apiService.connectionState() === 'connected'"
            [class.unreachable]="apiService.connectionState() === 'unreachable'">
            <span class="dot"></span>
            <span>
              {{
                apiService.connectionState() === 'connected'
                  ? 'Win32 API Ready'
                  : apiService.connectionState() === 'checking'
                    ? 'Connecting...'
                    : 'API Offline (:5000)'
              }}
            </span>
          </div>
        </div>

        <!-- Action Controls -->
        <div class="header-actions">
          <button
            type="button"
            class="btn-mode"
            [class.active]="apiService.liveControl()"
            [attr.aria-pressed]="apiService.liveControl()"
            (click)="apiService.toggleLiveControl()"
            title="Toggle Live Control (Off = Practice mode, On = Control real Windows)">
            <span>Live control {{ apiService.liveControl() ? 'on' : 'off' }}</span>
          </button>

          <button
            type="button"
            class="btn-mode"
            [class.active]="simulationMode()"
            (click)="toggleSimulationMode()"
            title="Toggle Mouse Simulation Mode (Click = Pinch, Drag = Move, Shift + Move = Scroll)">
            <span class="icon">{{ simulationMode() ? '🖱️' : '📷' }}</span>
            <span>{{ simulationMode() ? 'Simulation Mode (Mouse)' : 'Webcam Mode' }}</span>
          </button>

          <button
            type="button"
            class="btn-icon"
            [class.active]="compactMode()"
            (click)="compactMode.set(!compactMode())"
            title="Toggle Compact Corner Mode">
            {{ compactMode() ? 'Expand UI' : 'Compact' }}
          </button>

          <button
            *ngIf="pipSupported"
            type="button"
            class="btn-mode"
            [class.active]="isPipActive()"
            (click)="toggleDocumentPiP()"
            title="Pop HUD into an Always-on-Top Picture-in-Picture window so gestures work while you focus other desktop apps">
            <span>{{ isPipActive() ? '↙ Dock HUD' : '⧉ PiP Float (Always-on-Top)' }}</span>
          </button>

          <button
            type="button"
            class="btn-icon"
            [class.active]="showSettings()"
            (click)="showSettings.set(!showSettings())">
            ⚙ Tuning
          </button>
        </div>
      </header>

      <!-- Main Spatial Workspace -->
      <main class="workspace">
        <!-- Placeholder shown in the main tab while the HUD viewport is floating in Always-on-Top PiP -->
        <div #pipHostSlot class="pip-host-slot">
          <div class="pip-active-banner glass-panel" *ngIf="isPipActive()">
            <div class="pill-gold">ALWAYS-ON-TOP PIP ACTIVE</div>
            <h2>Scepter HUD is Floating Above Your Desktop</h2>
            <p>
              Focus and work inside any desktop window (Notepad, VS Code, Chrome, Explorer) —
              your floating Scepter HUD stays active and unthrottled on top.
            </p>
            <button type="button" class="btn-gold" (click)="toggleDocumentPiP()">
              Dock HUD Back to Browser Tab
            </button>
          </div>

          <!-- Viewport Container (Video + Canvas HUD + Simulation Surface) -->
          <section
            #viewportContainer
            class="viewport-card glass-panel"
            [class.sim-active]="simulationMode()"
            [class.pip-floating]="isPipActive()"
            (pointerdown)="onSimPointerDown($event)"
            (pointermove)="onSimPointerMove($event)"
            (pointerup)="onSimPointerUp($event)"
            (pointerleave)="onSimPointerLeave()">

          <!-- Mirrored Webcam Video Element -->
          <video
            #webcamVideo
            class="webcam-video"
            [class.hidden]="simulationMode()"
            playsinline
            muted></video>

          <!-- Simulation Mode Interactive Grid Backdrop -->
          <div class="sim-backdrop" *ngIf="simulationMode()">
            <div class="sim-instructions">
              <span class="pill-gold">MOUSE SIMULATION ACTIVE</span>
              <h2>Click &amp; Hold to Pinch-Grab &bull; Drag to an Edge Zone &bull; Release to Snap</h2>
              <p>
                Feeds synthetic pointer coordinates into the exact same
                <code>GestureStateMachine</code> &amp; Win32 P/Invoke pipeline.
              </p>
            </div>
          </div>

          <!-- Camera Permission / Missing / Loading Overlay (when in Webcam mode) -->
          <div
            class="camera-status-overlay"
            *ngIf="!simulationMode() && (cameraService.state() !== 'active' || trackerService.status() !== 'ready')">
            <div class="status-modal glass-panel">
              <ng-container *ngIf="cameraService.state() === 'requesting' || trackerService.status() === 'loading'">
                <div class="spinner"></div>
                <h3>Initializing Spatial Vision...</h3>
                <p>Loading local MediaPipe HandLandmarker WASM &amp; GPU delegate.</p>
              </ng-container>

              <ng-container *ngIf="cameraService.state() === 'denied' || cameraService.state() === 'missing' || cameraService.state() === 'error'">
                <div class="warn-badge">Camera Unavailable</div>
                <h3>{{ cameraService.state() === 'denied' ? 'Camera Permission Denied' : cameraService.state() === 'error' ? 'Camera Not Delivering Video' : 'No Webcam Detected' }}</h3>
                <p>{{ cameraService.errorMessage() }}</p>
                <div class="modal-actions">
                  <button type="button" class="btn-gold" (click)="enableSimulationMode()">
                    Switch to Mouse Simulation Mode
                  </button>
                  <button type="button" class="btn-outline" (click)="retryWebcam()">
                    Retry Camera
                  </button>
                </div>
              </ng-container>
            </div>
          </div>

          <!-- Layered Canvas HUD Overlay -->
          <app-hud-overlay
            [frame]="frame()"
            [settings]="settingsService.settings()"
            [simulationMode]="simulationMode()" />

          <!-- Bottom Telemetry Bar inside Viewport -->
          <div class="viewport-hud-footer">
            <div class="telemetry-item">
              <span class="k">TARGET WINDOW</span>
              <span class="v highlight">
                {{ apiService.activeWindow()?.title || 'None detected' }}
                <small *ngIf="apiService.activeWindow()?.processName">
                  ({{ apiService.activeWindow()?.processName }})
                </small>
              </span>
            </div>

            <div class="telemetry-item" *ngIf="apiService.lastSnapResult() as last">
              <span class="k">LAST ACTION</span>
              <span class="v" [class.err]="!last.success">
                {{ last.message }}
              </span>
            </div>

            <div class="telemetry-item metrics">
              <span>Pinch Ratio: <strong>{{ frame().normalizedPinchDistance | number:'1.2-2' }}</strong></span>
              <span *ngIf="frame().armedZone" class="armed-pill">ARMED: {{ frame().armedZone | uppercase }}</span>
            </div>
          </div>
          </section>
        </div>

        <!-- Side Panel: Quick Deck + Live Calibration Settings -->
        <aside class="side-column" *ngIf="!compactMode()">
          <!-- Direct Command Deck (Quick Test & Judge Demo Controls) -->
          <div class="quick-deck glass-panel">
            <div class="deck-header">
              <h3>Royal Command Deck</h3>
              <span class="deck-sub">Instant Win32 Snap Trigger</span>
            </div>
            <p class="deck-target">
              Active Target:
              <strong>{{ apiService.activeWindow()?.title || 'Waiting for eligible desktop window...' }}</strong>
            </p>
            <div class="snap-buttons-grid">
              <button type="button" (click)="triggerDirectSnap('topLeft')">↖ Top Left</button>
              <button type="button" class="primary-snap" (click)="triggerDirectSnap('top')">↑ Maximize</button>
              <button type="button" (click)="triggerDirectSnap('topRight')">↗ Top Right</button>
              <button type="button" class="primary-snap" (click)="triggerDirectSnap('left')">← Left Half</button>
              <button type="button" class="primary-snap" (click)="triggerDirectSnap('right')">Right Half →</button>
              <button type="button" (click)="triggerDirectSnap('bottomLeft')">↙ Btm Left</button>
              <button type="button" (click)="triggerDirectSnap('nextMonitor')">⇄ Next Monitor</button>
              <button type="button" (click)="triggerDirectSnap('bottomRight')">↘ Btm Right</button>
            </div>

            <!-- Window Cycling (Virtual Alt+Tab) Controls -->
            <div class="cycle-section">
              <div class="cycle-header">
                <span class="cycle-title">Window Cycling (Wave or Click)</span>
                <div class="cycle-btn-pair">
                  <button type="button" class="btn-cycle" (click)="triggerCycle('prev')" title="Cycle to Previous Window">
                    ◀ Prev
                  </button>
                  <button type="button" class="btn-cycle" (click)="triggerCycle('next')" title="Cycle to Next Window (Push Current to Back)">
                    Next ▶
                  </button>
                </div>
              </div>

              <div class="window-stack-list" *ngIf="apiService.recentWindows().length > 0">
                <button
                  type="button"
                  class="stack-item"
                  *ngFor="let win of apiService.recentWindows(); let idx = index"
                  [class.active]="win.handle === apiService.activeWindow()?.handle"
                  (click)="selectTargetWindow(win.handle)">
                  <span class="stack-rank">#{{ idx + 1 }}</span>
                  <span class="stack-name">{{ win.title }}</span>
                  <span class="stack-proc">{{ win.processName }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Collapsible or Always-Visible Settings Panel -->
          <app-settings-panel *ngIf="showSettings()" />
        </aside>
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      color: #f8fafc;
    }
    .scepter-app {
      display: flex;
      flex-direction: column;
      height: 100vh;
      padding: 0.75rem 1rem;
      gap: 0.75rem;
      box-sizing: border-box;
      max-width: 1680px;
      margin: 0 auto;
    }
    .scepter-app.compact-mode {
      padding: 0.4rem;
      gap: 0.4rem;
    }
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 0.65rem 1.1rem;
      border-radius: 14px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .crown-emblem {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: radial-gradient(circle at 30% 30%, rgba(245, 185, 66, 0.25), rgba(15, 23, 42, 0.9));
      border: 1px solid rgba(245, 185, 66, 0.45);
      display: grid;
      place-items: center;
      box-shadow: 0 0 18px rgba(245, 185, 66, 0.22);
    }
    .brand-text h1 {
      margin: 0;
      font-size: 1.08rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .hud-tag {
      font-size: 0.68rem;
      padding: 0.1rem 0.42rem;
      border-radius: 5px;
      background: rgba(245, 185, 66, 0.18);
      color: #f5b942;
      border: 1px solid rgba(245, 185, 66, 0.4);
      letter-spacing: 0.08em;
    }
    .tagline {
      margin: 0.1rem 0 0;
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .status-strip {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      flex-wrap: wrap;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.32rem 0.7rem;
      border-radius: 999px;
      font-size: 0.75rem;
      background: rgba(15, 23, 42, 0.78);
      border: 1px solid rgba(148, 163, 184, 0.22);
      color: #cbd5e1;
    }
    .chip .label {
      color: #64748b;
      font-size: 0.68rem;
      font-weight: 600;
    }
    .chip .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #64748b;
    }
    .state-chip[data-state='HOVER'] .dot {
      background: #38bdf8;
      box-shadow: 0 0 8px #38bdf8;
    }
    .state-chip[data-state='GRABBING'],
    .state-chip[data-state='DRAGGING'] {
      border-color: rgba(245, 185, 66, 0.65);
      color: #ffe39f;
      background: rgba(245, 185, 66, 0.14);
    }
    .state-chip[data-state='GRABBING'] .dot,
    .state-chip[data-state='DRAGGING'] .dot {
      background: #f5b942;
      box-shadow: 0 0 10px #f5b942;
    }
    .state-chip[data-state='SCROLLING'] {
      border-color: rgba(134, 239, 172, 0.65);
      color: #bbf7d0;
      background: rgba(134, 239, 172, 0.14);
    }
    .state-chip[data-state='SCROLLING'] .dot {
      background: #4ade80;
      box-shadow: 0 0 10px #4ade80;
    }
    .sub-badge {
      font-size: 0.65rem;
      padding: 0.05rem 0.35rem;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      font-weight: 700;
    }
    .sub-badge.sim {
      background: rgba(245, 185, 66, 0.2);
      color: #f5b942;
    }
    .conn-chip.connected {
      border-color: rgba(16, 185, 129, 0.4);
      color: #a7f3d0;
    }
    .conn-chip.connected .dot {
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    .conn-chip.unreachable {
      border-color: rgba(244, 63, 94, 0.45);
      color: #fecdd3;
    }
    .conn-chip.unreachable .dot {
      background: #f43f5e;
      box-shadow: 0 0 8px #f43f5e;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .btn-mode, .btn-icon {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(15, 23, 42, 0.8);
      color: #e2e8f0;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 10px;
      padding: 0.42rem 0.8rem;
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .btn-mode:hover, .btn-icon:hover {
      border-color: rgba(245, 185, 66, 0.55);
      color: #ffe39f;
    }
    .btn-mode.active, .btn-icon.active {
      background: linear-gradient(135deg, rgba(245, 185, 66, 0.25), rgba(200, 138, 20, 0.15));
      border-color: rgba(245, 185, 66, 0.75);
      color: #ffe6a3;
      box-shadow: 0 0 16px rgba(245, 185, 66, 0.22);
    }
    .workspace {
      flex: 1;
      display: grid;
      grid-template-columns: 1fr 370px;
      gap: 0.85rem;
      min-height: 0;
    }
    .scepter-app.compact-mode .workspace {
      grid-template-columns: 1fr;
    }
    @media (max-width: 1080px) {
      .workspace {
        grid-template-columns: 1fr;
      }
    }
    .viewport-card {
      position: relative;
      border-radius: 16px;
      overflow: hidden;
      background: radial-gradient(circle at center, #111827 0%, #070a12 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      min-height: 360px;
      width: 100%;
      height: 100%;
    }
    .viewport-card.pip-floating {
      border-radius: 0;
      border: none;
      width: 100vw;
      height: 100vh;
      min-height: 100vh;
    }
    .pip-host-slot {
      display: flex;
      width: 100%;
      height: 100%;
      min-height: 360px;
    }
    .pip-active-banner {
      width: 100%;
      height: 100%;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
      gap: 0.75rem;
    }
    .pip-active-banner h2 {
      margin: 0;
      font-size: 1.2rem;
      color: #ffe6a3;
    }
    .pip-active-banner p {
      margin: 0 0 0.5rem;
      max-width: 440px;
      font-size: 0.85rem;
      color: #94a3b8;
      line-height: 1.5;
    }
    .viewport-card.sim-active {
      cursor: crosshair;
      background:
        radial-gradient(circle at 50% 45%, rgba(245, 185, 66, 0.08), transparent 65%),
        linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
        #080c16;
      background-size: 100% 100%, 36px 36px, 36px 36px, 100% 100%;
    }
    .webcam-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      /* Mirror video visually so it matches our mirrored landmark geometry */
      transform: scaleX(-1);
      filter: contrast(1.04) brightness(0.92);
    }
    .webcam-video.hidden {
      display: none;
    }
    .sim-backdrop {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
      padding: 2rem;
      text-align: center;
    }
    .sim-instructions {
      max-width: 480px;
      opacity: 0.72;
    }
    .pill-gold {
      display: inline-block;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #f5b942;
      background: rgba(245, 185, 66, 0.14);
      border: 1px solid rgba(245, 185, 66, 0.4);
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      margin-bottom: 0.6rem;
    }
    .sim-instructions h2 {
      font-size: 1.05rem;
      margin: 0 0 0.4rem;
      color: #f8fafc;
    }
    .sim-instructions p {
      font-size: 0.78rem;
      color: #94a3b8;
      margin: 0;
    }
    .camera-status-overlay {
      position: absolute;
      inset: 0;
      background: rgba(7, 10, 18, 0.78);
      backdrop-filter: blur(8px);
      display: grid;
      place-items: center;
      z-index: 20;
      padding: 1.5rem;
    }
    .status-modal {
      max-width: 420px;
      padding: 1.6rem;
      border-radius: 16px;
      text-align: center;
      border: 1px solid rgba(245, 185, 66, 0.35);
    }
    .status-modal h3 {
      margin: 0.6rem 0 0.35rem;
      font-size: 1.05rem;
    }
    .status-modal p {
      margin: 0 0 1.1rem;
      font-size: 0.82rem;
      color: #94a3b8;
      line-height: 1.45;
    }
    .warn-badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      background: rgba(245, 185, 66, 0.18);
      color: #f5b942;
    }
    .modal-actions {
      display: flex;
      gap: 0.6rem;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn-gold {
      background: linear-gradient(135deg, #f5b942, #d99b1e);
      color: #090d16;
      font-weight: 700;
      border: none;
      padding: 0.55rem 1rem;
      border-radius: 10px;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .btn-outline {
      background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 0.55rem 1rem;
      border-radius: 10px;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .spinner {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 3px solid rgba(245, 185, 66, 0.2);
      border-top-color: #f5b942;
      animation: spin 0.85s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .viewport-hud-footer {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 12px;
      z-index: 15;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      padding: 0.55rem 0.9rem;
      border-radius: 12px;
      background: rgba(9, 13, 24, 0.82);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(245, 185, 66, 0.24);
      pointer-events: none;
    }
    .telemetry-item {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.75rem;
    }
    .telemetry-item .k {
      font-size: 0.66rem;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.06em;
    }
    .telemetry-item .v {
      color: #e2e8f0;
      font-weight: 600;
      max-width: 320px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .telemetry-item .v.highlight {
      color: #ffe39f;
    }
    .telemetry-item .v.err {
      color: #fda4af;
    }
    .telemetry-item.metrics {
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 0.72rem;
      color: #cbd5e1;
      gap: 0.65rem;
    }
    .armed-pill {
      background: rgba(245, 185, 66, 0.25);
      color: #ffe6a3;
      border: 1px solid #f5b942;
      padding: 0.1rem 0.45rem;
      border-radius: 6px;
      font-weight: 700;
    }
    .side-column {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      overflow-y: auto;
      padding-right: 2px;
    }
    .quick-deck {
      padding: 1rem 1.15rem;
      border-radius: 14px;
    }
    .deck-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 0.35rem;
    }
    .deck-header h3 {
      margin: 0;
      font-size: 0.92rem;
      color: #f8fafc;
    }
    .deck-sub {
      font-size: 0.68rem;
      color: #f5b942;
    }
    .deck-target {
      margin: 0 0 0.75rem;
      font-size: 0.74rem;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .deck-target strong {
      color: #e2e8f0;
    }
    .snap-buttons-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.42rem;
    }
    .snap-buttons-grid button {
      background: rgba(15, 23, 42, 0.75);
      color: #cbd5e1;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 8px;
      padding: 0.45rem 0.35rem;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .snap-buttons-grid button.primary-snap {
      border-color: rgba(245, 185, 66, 0.4);
      color: #ffe39f;
    }
    .snap-buttons-grid button:hover {
      background: rgba(245, 185, 66, 0.22);
      border-color: #f5b942;
      color: #fff;
      transform: translateY(-1px);
    }
    .cycle-section {
      margin-top: 0.85rem;
      padding-top: 0.75rem;
      border-top: 1px solid rgba(245, 185, 66, 0.16);
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .cycle-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
    }
    .cycle-title {
      font-size: 0.74rem;
      font-weight: 700;
      color: #cbd5e1;
      letter-spacing: 0.02em;
    }
    .cycle-btn-pair {
      display: flex;
      gap: 0.35rem;
    }
    .btn-cycle {
      background: rgba(245, 185, 66, 0.14);
      color: #ffe39f;
      border: 1px solid rgba(245, 185, 66, 0.4);
      border-radius: 7px;
      padding: 0.28rem 0.6rem;
      font-size: 0.72rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-cycle:hover {
      background: rgba(245, 185, 66, 0.28);
      box-shadow: 0 0 10px rgba(245, 185, 66, 0.25);
    }
    .window-stack-list {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      max-height: 135px;
      overflow-y: auto;
    }
    .stack-item {
      display: grid;
      grid-template-columns: 26px 1fr auto;
      align-items: center;
      gap: 0.4rem;
      text-align: left;
      background: rgba(15, 23, 42, 0.55);
      border: 1px solid rgba(148, 163, 184, 0.16);
      border-radius: 7px;
      padding: 0.32rem 0.5rem;
      font-size: 0.71rem;
      color: #cbd5e1;
      cursor: pointer;
      transition: all 0.14s ease;
    }
    .stack-item:hover {
      border-color: rgba(245, 185, 66, 0.45);
      color: #fff;
    }
    .stack-item.active {
      background: rgba(245, 185, 66, 0.16);
      border-color: rgba(245, 185, 66, 0.65);
      color: #ffe6a3;
    }
    .stack-rank {
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 0.66rem;
      color: #f5b942;
      font-weight: 700;
    }
    .stack-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .stack-proc {
      font-size: 0.64rem;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.05);
      padding: 0.08rem 0.35rem;
      border-radius: 4px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScepterShellComponent implements AfterViewInit {
  @ViewChild('webcamVideo', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('viewportContainer', { static: true }) viewportRef!: ElementRef<HTMLElement>;
  @ViewChild('pipHostSlot', { static: true }) pipHostSlotRef!: ElementRef<HTMLElement>;

  readonly cameraService = inject(CameraService);
  readonly trackerService = inject(HandTrackerService);
  readonly gestureEngine = inject(GestureEngineService);
  readonly apiService = inject(WindowApiService);
  readonly settingsService = inject(SettingsService);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  readonly simulationMode = signal<boolean>(false);
  readonly compactMode = signal<boolean>(false);
  readonly showSettings = signal<boolean>(true);
  readonly isPipActive = signal<boolean>(false);
  readonly fps = signal<number>(60);

  readonly frame = signal<GestureFrameSnapshot>({
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
  });

  readonly pipSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  private simPointer: Point2D | null = null;
  private simMouseDown = false;
  private simShiftDown = false;
  private simRafId: number | null = null;
  private readonly onKeyDownBound = (e: KeyboardEvent) => {
    if (e.key === 'Shift') this.simShiftDown = true;
  };
  private readonly onKeyUpBound = (e: KeyboardEvent) => {
    if (e.key === 'Shift') this.simShiftDown = false;
  };

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDownBound);
      window.addEventListener('keyup', this.onKeyUpBound);
    }
    // Keep gesture state machine settings synchronized with live sliders
    effect(() => {
      const currentSettings = this.settingsService.settings();
      this.gestureEngine.updateSettings(currentSettings);
    });

    this.destroyRef.onDestroy(() => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', this.onKeyDownBound);
        window.removeEventListener('keyup', this.onKeyUpBound);
      }
      this.stopAllLoops();
    });
  }

  async ngAfterViewInit(): Promise<void> {
    await this.startWebcamFlow();
  }

  async startWebcamFlow(): Promise<void> {
    this.stopSimulationLoop();
    const videoEl = this.videoRef.nativeElement;

    const trackerOk = await this.trackerService.initialize(2);
    const camOk = await this.cameraService.startCamera(videoEl);

    if (trackerOk && camOk) {
      this.trackerService.startTrackingLoop(videoEl, (trackingFrame) => {
        const snapshot = this.gestureEngine.processLandmarks(
          trackingFrame.hands,
          trackingFrame.timestampMs
        );
        this.ngZone.run(() => {
          this.fps.set(trackingFrame.fps);
          this.applyGestureSnapshot(snapshot);
        });
      });
    }
  }

  async retryWebcam(): Promise<void> {
    this.simulationMode.set(false);
    await this.startWebcamFlow();
  }

  enableSimulationMode(): void {
    if (!this.simulationMode()) {
      this.toggleSimulationMode();
    }
  }

  toggleSimulationMode(): void {
    const next = !this.simulationMode();
    this.simulationMode.set(next);
    this.gestureEngine.reset();

    if (next) {
      this.trackerService.stopTrackingLoop();
      this.cameraService.stopCamera(this.videoRef.nativeElement);
      this.startSimulationLoop();
    } else {
      this.stopSimulationLoop();
      void this.startWebcamFlow();
    }
  }

  onSimPointerDown(event: PointerEvent): void {
    if (!this.simulationMode()) return;
    this.simMouseDown = true;
    this.simShiftDown = event.shiftKey;
    this.updateSimPointerFromEvent(event);
  }

  onSimPointerMove(event: PointerEvent): void {
    if (!this.simulationMode()) return;
    this.simShiftDown = event.shiftKey;
    this.updateSimPointerFromEvent(event);
  }

  onSimPointerUp(event: PointerEvent): void {
    if (!this.simulationMode()) return;
    this.simMouseDown = false;
    this.simShiftDown = event.shiftKey;
    this.updateSimPointerFromEvent(event);
  }

  onSimPointerLeave(): void {
    if (!this.simulationMode()) return;
    this.simMouseDown = false;
    this.simShiftDown = false;
    this.simPointer = null;
  }

  triggerDirectSnap(position: SnapPosition): void {
    void this.apiService.snapWindow({
      position,
      ratio: this.settingsService.settings().snapRatio
    });
  }

  triggerCycle(direction: 'next' | 'prev'): void {
    void this.apiService.cycleWindow({ direction });
  }

  selectTargetWindow(handle: number): void {
    void this.apiService.cycleWindow({ direction: 'next', handle });
  }

  async toggleDocumentPiP(): Promise<void> {
    if (!this.pipSupported) return;

    try {
      const pipApi = (window as any).documentPictureInPicture;

      // If PiP window is already open, close it and dock viewport back
      if (pipApi.window) {
        pipApi.window.close();
        return;
      }

      const pipWindow: Window = await pipApi.requestWindow({
        width: 480,
        height: 340
      });

      // Set exact title "WAVEHUD" so the Win32 backend ignores the floating PiP window too
      pipWindow.document.title = 'WAVEHUD';
      pipWindow.document.body.style.margin = '0';
      pipWindow.document.body.style.background = '#060911';
      pipWindow.document.body.style.overflow = 'hidden';

      // Copy all stylesheets (including Angular component styles) into the PiP document
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          if (sheet.href) {
            const link = pipWindow.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = sheet.href;
            pipWindow.document.head.appendChild(link);
          } else if (sheet.cssRules) {
            const style = pipWindow.document.createElement('style');
            style.textContent = Array.from(sheet.cssRules)
              .map((r) => r.cssText)
              .join('\n');
            pipWindow.document.head.appendChild(style);
          }
        } catch {
          // Ignore cross-origin stylesheet access errors
        }
      }

      // Move the live viewport element into the Always-on-Top PiP window
      const viewportEl = this.viewportRef.nativeElement;
      pipWindow.document.body.appendChild(viewportEl);
      this.isPipActive.set(true);

      // Ensure video keeps playing smoothly after DOM reparenting
      const videoEl = this.videoRef.nativeElement;
      if (!this.simulationMode() && videoEl.paused && videoEl.srcObject) {
        void videoEl.play().catch(() => {});
      }

      // Restore viewport back into the main Angular tab when PiP closes
      pipWindow.addEventListener('pagehide', () => {
        this.ngZone.run(() => {
          this.pipHostSlotRef.nativeElement.appendChild(viewportEl);
          this.isPipActive.set(false);
          if (!this.simulationMode() && videoEl.paused && videoEl.srcObject) {
            void videoEl.play().catch(() => {});
          }
        });
      });
    } catch (err) {
      console.warn('Document Picture-in-Picture failed, falling back to compact mode:', err);
      this.compactMode.set(true);
    }
  }

  private updateSimPointerFromEvent(event: PointerEvent): void {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.simPointer = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    };
  }

  private startSimulationLoop(): void {
    this.stopSimulationLoop();
    this.fps.set(60);

    this.ngZone.runOutsideAngular(() => {
      const tick = (nowMs: number) => {
        if (!this.simulationMode()) return;

        const snapshot = this.gestureEngine.processPointerSimulation(
          this.simPointer,
          this.simMouseDown,
          nowMs,
          this.simShiftDown
        );

        this.ngZone.run(() => {
          this.applyGestureSnapshot(snapshot);
        });

        this.simRafId = requestAnimationFrame(tick);
      };

      this.simRafId = requestAnimationFrame(tick);
    });
  }

  private stopSimulationLoop(): void {
    if (this.simRafId !== null) {
      cancelAnimationFrame(this.simRafId);
      this.simRafId = null;
    }
  }

  private stopAllLoops(): void {
    this.stopSimulationLoop();
    this.trackerService.stopTrackingLoop();
    this.cameraService.stopCamera(this.videoRef?.nativeElement);
  }

  private applyGestureSnapshot(snapshot: GestureFrameSnapshot): void {
    this.frame.set(snapshot);

    if (snapshot.grabIssued) {
      void this.apiService.grabWindow({
        x: snapshot.grabIssued.x,
        y: snapshot.grabIssued.y
      });
    }

    if (snapshot.moveIssued) {
      void this.apiService.moveWindow({
        x: snapshot.moveIssued.x,
        y: snapshot.moveIssued.y,
        deltaX: snapshot.moveIssued.deltaX,
        deltaY: snapshot.moveIssued.deltaY
      });
    }

    if (snapshot.snapIssued) {
      void this.apiService.snapWindow({
        position: snapshot.snapIssued.position,
        ratio: snapshot.snapIssued.ratio
      });
    }

    if (snapshot.resizeIssued) {
      void this.apiService.resizeWindow({
        scaleFactor: snapshot.resizeIssued.scaleFactor
      });
    }

    if (snapshot.cycleIssued) {
      void this.apiService.cycleWindow({
        direction: snapshot.cycleIssued.direction
      });
    }

    if (snapshot.scrollIssued) {
      void this.apiService.scrollInput(snapshot.scrollIssued);
    }
  }
}

