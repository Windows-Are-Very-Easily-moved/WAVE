import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  NgZone,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Point2D } from '../../core/models/landmark.model';
import { WaveViewModelStore } from '../../core/services/wave-view-model.store';
import { HudOverlayComponent } from '../hud-overlay/hud-overlay.component';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component';
import { ScenesPanelComponent } from '../scenes-panel/scenes-panel.component';

interface MoveDisplayCard {
  id: string;
  num: string;
  name: string;
  hint: string;
  does: string;
  icon: string;
  done: boolean;
}

@Component({
  selector: 'app-scepter-shell',
  standalone: true,
  imports: [CommonModule, HudOverlayComponent, SettingsPanelComponent, ScenesPanelComponent],
  template: `
    <div class="w-shell" [class.w-compact]="store.compactMode()" [class.w-blurred]="!entered()">
      <!-- Screen-reader live region for state & practice announcements -->
      <div class="sr-only" aria-live="polite" aria-atomic="true">
        {{ store.ariaAnnouncement() }}
      </div>

      <!-- ================= HEADER ================= -->
      <header class="w-header">
        <div class="w-brand">
          <img src="assets/wave-landing-figure.jpg" alt="" class="w-brand-logo" aria-hidden="true" />
          <div>
            <div class="w-brand-row">
              <span class="w-brand-title">W.A.V.E</span>
              <span *ngIf="store.simulationMode()" class="w-tag">Simulation</span>
            </div>
            <p class="w-brand-sub">Windows Are Very Easily-moved</p>
          </div>
        </div>

        <div class="w-header-actions">
          <!-- Backend Status Pill -->
          <div
            class="w-pill"
            role="status"
            aria-label="Backend status"
            [title]="
              store.backendStatus() === 'connected'
                ? 'Connected to local Win32 desktop backend on localhost:5000'
                : 'Running in Browser Mode. Run the local Windows agent on your PC to move native OS apps.'
            ">
            <svg viewBox="0 0 24 24" class="w-ico-sm w-muted" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="8" rx="2" />
              <rect x="2" y="13" width="20" height="8" rx="2" />
              <path d="M6 7h.01M6 17h.01" stroke-linecap="round" />
            </svg>
            <span
              class="w-dot"
              [class.w-dot-spin]="store.backendStatus() === 'checking'"
              [class.w-dot-green]="
                store.backendStatus() === 'connected' ||
                (store.backendStatus() === 'unreachable' && store.liveControl())
              "
              [class.w-dot-gold]="store.backendStatus() === 'unreachable' && !store.liveControl()"></span>
            <span>
              {{
                store.backendStatus() === 'checking'
                  ? 'Checking…'
                  : store.backendStatus() === 'connected'
                    ? 'Desktop Agent'
                    : store.liveControl()
                      ? 'Browser Live Mode'
                      : 'Practice Mode'
              }}
            </span>
          </div>

          <!-- Live Control Toggle (styled like golden Air Mouse pill in reference image) -->
          <button
            type="button"
            (click)="store.toggleLiveControl()"
            [attr.aria-pressed]="store.liveControl()"
            aria-label="Toggle Live control mode"
            title="Toggle Live control (Off = Practice mode, On = Control real Windows)"
            class="w-pill w-pill-btn"
            [class.w-pill-gold]="store.liveControl()">
            {{ store.liveControl() ? 'Live control on' : 'Live control off' }}
          </button>

          <!-- Simulation Mode Toggle (Hand with slash icon) -->
          <button
            type="button"
            (click)="toggleSimulationMode()"
            [attr.aria-pressed]="store.simulationMode()"
            aria-label="Toggle Mouse Simulation mode"
            title="Toggle Mouse Simulation mode (Click = Pinch, Drag = Move, Shift + Move = V-Sign Scroll)"
            class="w-icon-btn"
            [class.w-icon-btn-active]="store.simulationMode()">
            <svg viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" stroke-linecap="round" />
              <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" stroke-linecap="round" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" stroke-linecap="round" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" stroke-linecap="round" />
              <line *ngIf="!store.simulationMode()" x1="2" y1="2" x2="22" y2="22" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Camera On / Off Toggle -->
          <button
            type="button"
            (click)="toggleCamera()"
            class="w-icon-btn"
            [class.w-icon-btn-active]="store.cameraStatus() === 'active'"
            [attr.aria-label]="store.cameraStatus() === 'active' ? 'Turn camera off' : 'Turn camera on'"
            [title]="store.cameraStatus() === 'active' ? 'Turn camera off' : 'Turn camera on'">
            <svg *ngIf="store.cameraStatus() === 'active'" viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m22 8-6 4 6 4V8Z" stroke-linecap="round" stroke-linejoin="round" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
            <svg *ngIf="store.cameraStatus() !== 'active'" viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="2" y1="2" x2="22" y2="22" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Wave Scenes Drawer (W) -->
          <button
            *ngIf="store.scenesEnabled()"
            type="button"
            (click)="store.toggleScenesDrawer()"
            [attr.aria-pressed]="store.scenesOpen()"
            aria-label="Open scenes manager"
            title="Wave Scenes (W)"
            class="w-icon-btn"
            [class.w-icon-btn-active]="store.scenesOpen()">
            <svg viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>

          <!-- Always-on-Top PiP -->
          <button
            *ngIf="pipSupported"
            type="button"
            (click)="toggleDocumentPiP()"
            [attr.aria-pressed]="store.isPipActive()"
            aria-label="Pop out HUD in always-on-top Picture-in-Picture window"
            title="Pop out Always-on-Top HUD"
            class="w-icon-btn"
            [class.w-icon-btn-active]="store.isPipActive()">
            <svg viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 4.5v5H3m-1-6 6 6m13 0v-3c0-1.16-.84-2-2-2h-7m-9 9v2c0 1.05.95 2 2 2h3" stroke-linecap="round" stroke-linejoin="round" />
              <rect width="10" height="7" x="12" y="13.5" rx="2" />
            </svg>
          </button>

          <!-- Compact Mode -->
          <button
            type="button"
            (click)="store.toggleCompactMode()"
            [attr.aria-pressed]="store.compactMode()"
            aria-label="Toggle compact stage mode"
            title="Toggle compact mode"
            class="w-icon-btn"
            [class.w-icon-btn-active]="store.compactMode()">
            <svg viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 14 10 14 10 20" stroke-linecap="round" stroke-linejoin="round" />
              <polyline points="20 10 14 10 14 4" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="14" y1="10" x2="21" y2="3" stroke-linecap="round" />
              <line x1="3" y1="21" x2="10" y2="14" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Sound Mute Toggle (M) -->
          <button
            type="button"
            (click)="store.toggleMute()"
            [attr.aria-pressed]="store.muted()"
            [attr.aria-label]="store.muted() ? 'Unmute sound cues' : 'Mute sound cues'"
            [title]="store.muted() ? 'Sound is MUTED — click to unmute (M)' : 'Sound is ON — click to mute (M)'"
            class="w-icon-btn"
            [class.w-icon-btn-muted]="store.muted()">
            <svg *ngIf="!store.muted()" viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke-linecap="round" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke-linecap="round" />
            </svg>
            <svg *ngIf="store.muted()" viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="22" y1="9" x2="16" y2="15" stroke-linecap="round" />
              <line x1="16" y1="9" x2="22" y2="15" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Gesture Guide (C) -->
          <button
            type="button"
            (click)="store.toggleGuideModal(true)"
            aria-label="Open gesture guide"
            title="Gesture guide (C)"
            class="w-icon-btn">
            <svg viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M12 17h.01" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Settings Drawer (S) -->
          <button
            type="button"
            (click)="store.toggleSettingsDrawer(true)"
            aria-label="Open settings drawer"
            title="Settings (S)"
            class="w-icon-btn">
            <svg viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="21" y1="4" x2="14" y2="4" stroke-linecap="round" />
              <line x1="10" y1="4" x2="3" y2="4" stroke-linecap="round" />
              <line x1="21" y1="12" x2="12" y2="12" stroke-linecap="round" />
              <line x1="8" y1="12" x2="3" y2="12" stroke-linecap="round" />
              <line x1="21" y1="20" x2="16" y2="20" stroke-linecap="round" />
              <line x1="12" y1="20" x2="3" y2="20" stroke-linecap="round" />
              <line x1="14" y1="2" x2="14" y2="6" stroke-linecap="round" />
              <line x1="8" y1="10" x2="8" y2="14" stroke-linecap="round" />
              <line x1="16" y1="18" x2="16" y2="22" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <!-- ================= MAIN STAGE HOST (supports Document PiP reparenting) ================= -->
      <div #pipHostSlot class="w-stage-host">
        <!-- Placeholder shown in main tab when stage is popped out into Always-on-Top PiP -->
        <div *ngIf="store.isPipActive()" class="w-pip-placeholder">
          <span class="w-tag">Always-on-Top PiP Active</span>
          <h2 class="w-pip-title">W.A.V.E HUD is floating above your desktop</h2>
          <p class="w-sub">Focus any Windows app to snap or V-sign scroll it while the floating HUD stays active.</p>
          <button type="button" (click)="toggleDocumentPiP()" class="w-btn-gold">Dock HUD back to tab</button>
        </div>

        <!-- INTERACTIVE STAGE -->
        <main
          #viewportContainer
          class="w-stage"
          [class.w-stage-sim]="store.simulationMode()"
          [class.w-stage-pip]="store.isPipActive()"
          (pointerdown)="onSimPointerDown($event)"
          (pointermove)="onSimPointerMove($event)"
          (pointerup)="onSimPointerUp($event)"
          (pointerleave)="onSimPointerLeave()">
          <!-- Neutral stage backdrop + grid (visible when camera is off) -->
          <div class="w-stage-bg"></div>
          <div class="w-stage-grid grid-lines"></div>

          <!-- Mirrored Webcam Video (Full screen inside stage when active) -->
          <video
            #webcamVideo
            playsinline
            muted
            autoplay
            class="w-video"
            [class.w-video-live]="!store.simulationMode() && store.cameraStatus() === 'active'"></video>

          <!-- Subtle vignette over the live camera so HUD cards remain readable -->
          <div class="w-vignette"></div>

          <!-- Canvas HUD Overlay (runs rAF loop outside Angular zone) -->
          <app-hud-overlay />

          <!-- Simulation Mode Helper Banner -->
          <div *ngIf="store.simulationMode()" class="w-sim-banner">
            <span class="w-dot w-dot-gold w-pulse"></span>
            <span>SIMULATION · Click &amp; hold = Grab · Drag to edge &amp; release = Snap · Hold Shift + move = V-Scroll</span>
          </div>

          <!-- Top-Left: Gesture State Card (matches second reference image) -->
          <div class="w-state-card" [class.w-state-card-sm]="store.isPipActive()">
            <div class="w-state-icon" [attr.data-tone]="store.stateMeta().tone">
              <svg viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" stroke-linecap="round" />
                <line x1="8" y1="12" x2="16" y2="12" stroke-linecap="round" />
              </svg>
            </div>
            <div class="w-min0">
              <div class="w-state-row">
                <span class="w-state-label" [attr.data-tone]="store.stateMeta().tone">{{ store.stateMeta().label }}</span>
                <span
                  *ngIf="
                    (store.gestureState() === 'GRABBING' || store.gestureState() === 'DRAGGING') &&
                    store.grabbedWindowTitle()
                  "
                  class="w-state-window">
                  {{ store.grabbedWindowTitle() }}
                </span>
              </div>
              <p *ngIf="!store.isPipActive()" class="w-state-hint">{{ store.stateMeta().hint }}</p>
            </div>
          </div>

          <!-- Top-Right: Tab Hidden Warning -->
          <div class="w-alerts">
            <div *ngIf="store.tabHidden() && !store.isPipActive()" class="w-alert">
              <div class="w-alert-title">Tab was in the background</div>
              <p class="w-sub">Browsers pause camera frames in hidden tabs. Keep W.A.V.E visible or pop out the PiP HUD.</p>
              <button type="button" (click)="store.setTabHidden(false)" class="w-link">Got it</button>
            </div>
          </div>

          <!-- Center: Camera Off placeholder (matches second reference image laptop-webcam graphic; clicking turns camera on) -->
          <div *ngIf="!store.simulationMode() && store.cameraStatus() === 'idle'" class="w-center">
            <button
              type="button"
              (click)="startCamera()"
              class="w-cam-off-trigger"
              title="Click to turn on camera">
              <svg viewBox="0 0 120 120" class="w-cam-off-art" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
                <circle cx="60" cy="30" r="16" />
                <rect x="47" y="23" width="26" height="14" rx="7" />
                <circle cx="66" cy="30" r="4" fill="currentColor" />
                <path d="M30 46h60v40H30z" />
                <path d="M30 86 18 108h84L90 86" />
              </svg>
              <span class="w-cam-off-caption">Camera is off · Click here or the camera icon above to start</span>
            </button>
          </div>

          <!-- Center: Camera Loading / Permission Denied / Missing / Error -->
          <div
            *ngIf="
              !store.simulationMode() &&
              store.cameraStatus() !== 'idle' &&
              (store.cameraStatus() !== 'active' || store.trackerStatus() !== 'ready')
            "
            class="w-center">
            <div class="w-status-card">
              <ng-container *ngIf="store.cameraStatus() === 'requesting' || store.trackerStatus() === 'loading'">
                <svg viewBox="0 0 24 24" class="w-spinner" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" />
                </svg>
                <h3 class="w-status-title">
                  {{ store.cameraStatus() === 'requesting' ? 'Starting camera…' : 'Loading hand-tracking model…' }}
                </h3>
                <p class="w-sub">
                  {{
                    store.cameraStatus() === 'requesting'
                      ? 'Approve the browser camera prompt if one appears.'
                      : 'Warming up MediaPipe Hand Landmarker in your browser (runs 100% locally).'
                  }}
                </p>
              </ng-container>

              <ng-container
                *ngIf="
                  store.cameraStatus() === 'denied' ||
                  store.cameraStatus() === 'missing' ||
                  store.cameraStatus() === 'error' ||
                  store.trackerStatus() === 'error'
                ">
                <svg viewBox="0 0 24 24" class="w-status-err" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" stroke-linecap="round" />
                  <line x1="12" y1="16" x2="12.01" y2="16" stroke-linecap="round" />
                </svg>
                <h3 class="w-status-title">
                  {{
                    store.cameraStatus() === 'denied'
                      ? 'Camera access was blocked'
                      : store.cameraStatus() === 'missing'
                        ? 'No camera detected'
                        : 'Camera error'
                  }}
                </h3>
                <p class="w-sub">
                  {{ store.cameraError() || 'Could not start the webcam. You can retry or switch to Mouse Simulation mode.' }}
                </p>
                <div class="w-cam-off-actions">
                  <button type="button" (click)="startCamera()" class="w-btn-ghost">Try again</button>
                  <button type="button" (click)="enableSimulationMode()" class="w-btn-gold">Switch to Simulation Mode</button>
                </div>
              </ng-container>
            </div>
          </div>

          <!-- Bottom-Right: Telemetry Card (matches second reference image) -->
          <div class="w-telemetry">
            <div class="w-telemetry-row">
              <span class="w-label">FPS</span>
              <span class="w-label">TRACKING</span>
            </div>
            <div class="w-telemetry-row w-telemetry-values">
              <span class="w-fps">
                <svg viewBox="0 0 24 24" class="w-ico-sm w-gold" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ store.cameraStatus() === 'active' || store.simulationMode() ? store.fps() : '0' }}
              </span>
              <span class="w-bars" title="Tracking confidence">
                <span
                  *ngFor="let lit of store.confidenceBars(); let i = index"
                  class="w-bar"
                  [class.w-bar-lit]="lit"
                  [style.height.px]="4 + i * 2"></span>
              </span>
            </div>
            <div class="w-label w-mt">LAST ACTION</div>
            <div class="w-last">{{ store.lastResult() || 'None yet' }}</div>
          </div>
        </main>
      </div>

      <!-- ================= SIX MOVES TO MASTER ================= -->
      <section *ngIf="!store.compactMode()" class="w-panel" aria-label="Six Moves to Master">
        <div class="w-panel-head">
          <div>
            <h2 class="w-panel-title">
              Six Moves to Master
              <span *ngIf="sixMovesCompletedCount() === 6" class="w-mastered">All 6 mastered ✨</span>
            </h2>
            <p class="w-sub">
              Cards light up when the camera really sees each move.
              {{ sixMovesCompletedCount() }}/6 mastered.
            </p>
          </div>
          <div class="w-panel-actions">
            <button type="button" (click)="store.toggleGuideModal(true)" class="w-btn-gold w-btn-sm">
              <svg viewBox="0 0 24 24" class="w-ico-sm" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 10 12 5 2 10l10 5 10-5z" stroke-linejoin="round" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" stroke-linecap="round" />
              </svg>
              Start tutorial
            </button>
            <button type="button" (click)="store.resetPractice()" class="w-link-muted">
              <svg viewBox="0 0 24 24" class="w-ico-sm" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke-linecap="round" />
                <path d="M3 3v5h5" stroke-linecap="round" />
              </svg>
              Reset
            </button>
          </div>
        </div>

        <div class="w-progress">
          <div
            class="w-progress-fill"
            [style.width.%]="(sixMovesCompletedCount() / 6) * 100"></div>
        </div>

        <div class="w-cards">
          <div
            *ngFor="let card of sixMovesCards()"
            class="w-card"
            [class.w-card-done]="card.done">
            <div class="w-card-icon">
              <svg viewBox="0 0 24 24" class="w-ico" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path [attr.d]="card.icon" />
              </svg>
            </div>
            <div class="w-card-body">
              <div class="w-card-top">
                <span class="w-card-num">{{ card.num }}</span>
                <span class="w-card-name">{{ card.name }}</span>
                <svg *ngIf="card.done" viewBox="0 0 24 24" class="w-card-check" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
              <div class="w-card-hint">{{ card.hint }}</div>
              <div class="w-card-foot">
                <span>Does: {{ card.does }}</span>
                <span>{{ card.done ? 'done' : '—' }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- BOTTOM-CENTER TOAST NOTIFICATIONS -->
      <div
        *ngIf="store.toasts().length > 0"
        class="pointer-events-none fixed bottom-12 left-1/2 z-50 flex flex-col items-center gap-2"
        style="transform: translateX(-50%);">
        <div
          *ngFor="let toast of store.toasts()"
          class="w-toast"
          [attr.data-tone]="toast.tone">
          <div>
            <div class="w-toast-title">{{ toast.title }}</div>
            <div *ngIf="toast.description" class="w-toast-desc">{{ toast.description }}</div>
          </div>
          <button
            type="button"
            (click)="store.dismissToast(toast.id)"
            aria-label="Dismiss notification"
            class="w-toast-x">
            ✕
          </button>
        </div>
      </div>

      <!-- GESTURE GUIDE MODAL (C) -->
      <div
        *ngIf="store.guideOpen()"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wave-guide-title">
        <div
          class="fixed inset-0"
          style="background: rgba(5, 7, 13, 0.92); backdrop-filter: blur(8px);"
          (click)="store.toggleGuideModal(false)"
          aria-hidden="true"></div>
        <div
          (wheel)="$event.stopPropagation()"
          style="background: #0d0e12; border: 1px solid #2a2b31; max-height: 82vh;"
          class="relative z-10 overflow-y-auto w-full max-w-lg rounded-2xl p-6 text-foreground shadow-2xl space-y-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-center gap-3">
              <img
                src="assets/wave-landing-figure.jpg"
                alt="W.A.V.E emblem"
                class="h-12 w-12 rounded-2xl border border-primary/40 object-cover" />
              <div>
                <h2 id="wave-guide-title" class="font-display text-xl font-bold text-gold-gradient">
                  W.A.V.E Gesture Guide
                </h2>
                <p class="text-xs text-muted-foreground">
                  Spatial hand gestures to move, snap, scroll, switch windows, and launch Wave Scenes.
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="store.toggleGuideModal(false)"
              aria-label="Close gesture guide"
              class="w-icon-btn">
              ✕
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              *ngFor="let card of sixMovesCards()"
              class="rounded-2xl border border-glass-border bg-secondary/40 p-3.5">
              <div class="font-display text-sm font-semibold text-primary">{{ card.num }} · {{ card.name }}</div>
              <div class="mt-1 text-xs text-muted-foreground">{{ card.hint }}</div>
            </div>
          </div>

          <div class="rounded-2xl border border-glass-border bg-secondary/30 p-3.5 text-xs text-muted-foreground space-y-1">
            <div class="font-semibold text-foreground">Keyboard Shortcuts &amp; Simulation</div>
            <p>
              Press <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">W</kbd> for Scenes,
              <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">U</kbd> to Undo scene apply,
              <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">S</kbd> for Settings,
              <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">M</kbd> to Mute sound cues, or
              <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">C</kbd> for this guide.
              In Simulation mode, hold <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">Shift</kbd> while moving the mouse to scroll, or press <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">3</kbd> / <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">4</kbd> to trigger scene gestures.
            </p>
          </div>

          <div class="flex justify-end">
            <button type="button" (click)="store.toggleGuideModal(false)" class="w-btn-gold">Got it</button>
          </div>
        </div>
      </div>

      <!-- SETTINGS DRAWER -->
      <app-settings-panel />

      <!-- SCENES DRAWER & CAPTURE MODAL -->
      <app-scenes-panel />
    </div>

    <!-- ================= LANDING PAGE OVERLAY (Matches 1st Image) ================= -->
    <div *ngIf="!entered()" class="w-landing" role="dialog" aria-modal="true" aria-labelledby="wave-landing-title">
      <div class="w-landing-card">
        <div class="w-landing-glow" aria-hidden="true"></div>
        <img src="assets/wave-landing-figure.jpg" alt="" class="w-landing-figure" aria-hidden="true" />
        <h1 id="wave-landing-title" class="w-landing-title">W.A.V.E</h1>
        <p class="w-landing-tagline">Windows Are Very Easily-moved.</p>
        <p class="w-landing-desc">
          Move your hand to steer the cursor, pinch to click, and use simple poses to scroll and switch apps.
        </p>
        <button type="button" class="w-landing-begin" (click)="begin()" autofocus>Begin</button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        --w-gold-1: #ffd66b;
        --w-gold-2: #f2b84b;
        --w-gold-3: #d9973a;
        --w-gold-grad: linear-gradient(135deg, var(--w-gold-1), var(--w-gold-2) 55%, var(--w-gold-3));
        --w-panel: #0b0c0f;
        --w-panel-2: #101116;
        --w-line: rgba(255, 255, 255, 0.08);
        --w-line-2: rgba(255, 255, 255, 0.13);
        --w-text: #f2f1ec;
        --w-muted: #8f8e8a;
        --w-green: #b8f05a;
      }

      /* ---------- Shell ---------- */
      .w-shell {
        display: flex;
        flex-direction: column;
        gap: 14px;
        height: 100vh;
        width: 100vw;
        padding: 12px 18px 16px;
        overflow-y: auto;
        overflow-x: hidden;
        background: radial-gradient(120% 60% at 50% 0%, rgba(60, 46, 18, 0.22), transparent 60%), #07080a;
        color: var(--w-text);
        user-select: none;
        transition: filter 0.35s ease;
      }
      .w-shell.w-compact {
        gap: 8px;
        padding: 8px;
      }
      .w-shell.w-blurred {
        filter: blur(10px) brightness(0.32);
        pointer-events: none;
      }
      .w-min0 { min-width: 0; }
      .w-muted { color: var(--w-muted); }
      .w-gold { color: var(--w-gold-2); }
      .w-ico { width: 15px; height: 15px; flex-shrink: 0; }
      .w-ico-sm { width: 13px; height: 13px; flex-shrink: 0; }
      .w-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--w-muted); line-height: 1.45; }
      .w-label {
        font-family: var(--font-mono);
        font-size: 9.5px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--w-muted);
      }
      .w-mt { margin-top: 10px; }

      /* ---------- Header ---------- */
      .w-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        flex-shrink: 0;
      }
      .w-brand { display: flex; align-items: center; gap: 10px; }
      .w-brand-logo {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #000;
      }
      .w-brand-row { display: flex; align-items: center; gap: 8px; }
      .w-brand-title {
        font-family: var(--font-sans);
        font-size: 16.5px;
        font-weight: 700;
        letter-spacing: -0.01em;
        background: var(--w-gold-grad);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        line-height: 1;
      }
      .w-brand-sub { margin: 3px 0 0; font-size: 10.5px; color: var(--w-muted); }
      .w-tag {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid rgba(242, 184, 75, 0.45);
        background: rgba(242, 184, 75, 0.12);
        color: var(--w-gold-2);
        padding: 2px 8px;
        font-family: var(--font-mono);
        font-size: 9.5px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .w-header-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }

      .w-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 30px;
        padding: 0 13px;
        border-radius: 999px;
        border: 1px solid var(--w-line-2);
        background: #111216;
        color: var(--w-text);
        font-size: 11.5px;
        font-weight: 500;
        white-space: nowrap;
      }
      .w-pill-btn { cursor: pointer; transition: all 0.15s ease; }
      .w-pill-btn:hover { border-color: rgba(242, 184, 75, 0.5); }
      .w-pill-gold {
        background: var(--w-gold-grad);
        color: #1a1408;
        border-color: transparent;
        font-weight: 600;
        box-shadow: 0 0 18px -4px rgba(242, 184, 75, 0.6);
      }

      .w-dot { display: inline-block; width: 7px; height: 7px; border-radius: 999px; background: var(--w-muted); flex-shrink: 0; }
      .w-dot-green { background: var(--w-green); box-shadow: 0 0 8px var(--w-green); }
      .w-dot-gold { background: var(--w-gold-2); }
      .w-dot-spin { background: transparent; border: 1.5px solid var(--w-muted); border-top-color: transparent; animation: w-spin 0.8s linear infinite; }
      .w-pulse { animation: w-pulse 1.4s ease-in-out infinite; }

      .w-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        border: 1px solid var(--w-line-2);
        background: #111216;
        color: var(--w-text);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .w-icon-btn:hover { border-color: rgba(242, 184, 75, 0.55); color: var(--w-gold-1); }
      .w-icon-btn-active { border-color: rgba(242, 184, 75, 0.75); color: var(--w-gold-1); background: rgba(242, 184, 75, 0.12); }
      .w-icon-btn-muted {
        border-color: rgba(255, 122, 107, 0.6);
        color: #ff7a6b;
        background: rgba(255, 122, 107, 0.15);
      }
      .w-icon-btn-muted:hover {
        border-color: rgba(255, 122, 107, 0.85);
        color: #ff9e92;
      }

      /* ---------- Buttons ---------- */
      .w-btn-gold {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border: 0;
        border-radius: 999px;
        padding: 8px 18px;
        background: var(--w-gold-grad);
        color: #1a1408;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 0 18px -4px rgba(242, 184, 75, 0.55);
        transition: transform 0.15s ease, filter 0.15s ease;
      }
      .w-btn-gold:hover { filter: brightness(1.06); transform: translateY(-1px); }
      .w-btn-sm { padding: 6px 13px; font-size: 11.5px; }
      .w-btn-ghost {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 8px 16px;
        border: 1px solid var(--w-line-2);
        background: rgba(17, 18, 22, 0.85);
        color: var(--w-text);
        font-size: 12px;
        cursor: pointer;
      }
      .w-btn-ghost:hover { border-color: rgba(242, 184, 75, 0.5); }
      .w-link { margin-top: 6px; background: none; border: 0; padding: 0; color: var(--w-gold-2); font-family: var(--font-mono); font-size: 11px; cursor: pointer; }
      .w-link-muted {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: none;
        border: 0;
        padding: 0 2px;
        color: var(--w-muted);
        font-size: 11.5px;
        cursor: pointer;
      }
      .w-link-muted:hover { color: var(--w-text); }

      /* ---------- Stage ---------- */
      .w-stage-host {
        position: relative;
        display: flex;
        flex: 0 0 calc(100vh - 76px);
        height: calc(100vh - 76px);
        min-height: 420px;
      }
      .w-shell.w-compact .w-stage-host {
        flex: 0 0 calc(100vh - 58px);
        height: calc(100vh - 58px);
      }
      .w-stage {
        position: relative;
        flex: 1;
        min-height: 360px;
        width: 100%;
        height: 100%;
        border-radius: 26px;
        overflow: hidden;
        border: 1px solid var(--w-line-2);
        background: #0f1013;
        box-shadow: 0 30px 60px -30px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }
      .w-stage-sim { cursor: crosshair; }
      .w-stage-pip { border-radius: 0 !important; border: 0 !important; width: 100vw; height: 100vh; }
      .w-stage-bg {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, #3c3c3f 0%, #2b2b2e 38%, #151518 76%, #0e0e10 100%);
        pointer-events: none;
      }
      .w-stage-grid { position: absolute; inset: 0; pointer-events: none; opacity: 0.72; }
      .w-video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transform: scaleX(-1);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.35s ease;
        z-index: 1;
      }
      .w-video.w-video-live { opacity: 1; }
      .w-vignette {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
        background: linear-gradient(0deg, rgba(8, 9, 11, 0.42) 0%, transparent 30%, transparent 75%, rgba(8, 9, 11, 0.22) 100%);
      }
      .w-stage app-hud-overlay { position: absolute; inset: 0; z-index: 3; }

      .w-sim-banner {
        position: absolute;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 999px;
        border: 1px solid rgba(242, 184, 75, 0.4);
        background: rgba(12, 13, 16, 0.85);
        color: var(--w-gold-1);
        font-family: var(--font-mono);
        font-size: 10.5px;
        pointer-events: none;
        white-space: nowrap;
      }

      .w-state-card {
        position: absolute;
        top: 14px;
        left: 14px;
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 11px;
        max-width: 420px;
        padding: 10px 16px 10px 12px;
        border-radius: 16px;
        background: rgba(24, 25, 29, 0.88);
        border: 1px solid var(--w-line);
        backdrop-filter: blur(10px);
        pointer-events: none;
      }
      .w-state-card-sm { padding: 6px 10px; }
      .w-state-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        color: var(--w-text);
      }
      .w-state-icon[data-tone='gold'],
      .w-state-icon[data-tone='gold-bright'] { color: var(--w-gold-1); }
      .w-state-icon[data-tone='armed'] { color: var(--w-green); }
      .w-state-row { display: flex; align-items: center; gap: 8px; }
      .w-state-label {
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.2em;
        color: var(--w-text);
      }
      .w-state-label[data-tone='gold'] { color: var(--w-gold-2); }
      .w-state-label[data-tone='gold-bright'] { color: var(--w-gold-1); }
      .w-state-label[data-tone='armed'] { color: var(--w-green); }
      .w-state-window {
        max-width: 160px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        border-radius: 6px;
        border: 1px solid rgba(242, 184, 75, 0.35);
        background: rgba(242, 184, 75, 0.1);
        color: var(--w-gold-1);
        padding: 1px 6px;
        font-family: var(--font-mono);
        font-size: 10px;
      }
      .w-state-hint { margin: 2px 0 0; font-size: 11px; color: var(--w-muted); line-height: 1.35; }

      .w-alerts { position: absolute; top: 14px; right: 14px; z-index: 20; display: flex; flex-direction: column; gap: 8px; max-width: 290px; }
      .w-alert {
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(242, 184, 75, 0.45);
        background: rgba(18, 19, 23, 0.94);
        font-size: 12px;
      }
      .w-alert-title { font-weight: 600; }

      .w-center { position: absolute; inset: 0; z-index: 15; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .w-cam-off-trigger {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        background: none;
        border: 0;
        padding: 16px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.34);
        transition: color 0.2s ease, transform 0.2s ease;
      }
      .w-cam-off-trigger:hover {
        color: rgba(255, 255, 255, 0.58);
        transform: scale(1.03);
      }
      .w-cam-off-art { width: 128px; height: 128px; }
      .w-cam-off-caption {
        font-size: 11.5px;
        color: rgba(255, 255, 255, 0.45);
      }
      .w-cam-off-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 4px; }

      .w-status-card {
        max-width: 420px;
        padding: 28px;
        border-radius: 22px;
        border: 1px solid var(--w-line-2);
        background: rgba(13, 14, 18, 0.95);
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      .w-status-title { margin: 0; font-size: 18px; font-weight: 600; }
      .w-spinner { width: 36px; height: 36px; color: var(--w-gold-2); animation: w-spin 0.9s linear infinite; }
      .w-status-err { width: 36px; height: 36px; color: #ff7a6b; }

      .w-telemetry {
        position: absolute;
        right: 14px;
        bottom: 14px;
        z-index: 20;
        width: 158px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(22, 23, 27, 0.9);
        border: 1px solid var(--w-line);
        backdrop-filter: blur(10px);
        pointer-events: none;
      }
      .w-telemetry-row { display: flex; align-items: center; justify-content: space-between; }
      .w-telemetry-values { margin-top: 6px; }
      .w-fps { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .w-bars { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
      .w-bar { width: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.15); }
      .w-bar-lit { background: var(--w-gold-2); }
      .w-last {
        margin-top: 3px;
        font-size: 11px;
        color: var(--w-text);
        opacity: 0.85;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .w-pip-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        height: 100%;
        padding: 24px;
        text-align: center;
        border-radius: 26px;
        border: 1px solid var(--w-line-2);
        background: var(--w-panel);
      }
      .w-pip-title { margin: 4px 0 0; font-size: 18px; font-weight: 600; color: var(--w-gold-1); }

      /* ---------- Six Moves to Master Panel ---------- */
      .w-panel {
        flex-shrink: 0;
        padding: 16px 16px 14px;
        border-radius: 20px;
        border: 1px solid var(--w-line);
        background: var(--w-panel);
      }
      .w-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .w-panel-title { margin: 0; font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .w-mastered { font-size: 11.5px; font-weight: 500; color: var(--w-green); }
      .w-panel-actions { display: flex; align-items: center; gap: 12px; }
      .w-progress { position: relative; height: 2px; margin: 12px 0 12px; border-radius: 2px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
      .w-progress-fill { height: 100%; background: var(--w-gold-grad); border-radius: 2px; transition: width 0.4s ease; }

      .w-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      @media (max-width: 900px) { .w-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .w-cards { grid-template-columns: 1fr; } }
      .w-card {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid var(--w-line);
        background: var(--w-panel-2);
        transition: border-color 0.2s ease, background 0.2s ease;
      }
      .w-card-done {
        border-color: rgba(242, 184, 75, 0.45);
        background: linear-gradient(180deg, rgba(242, 184, 75, 0.05), rgba(16, 17, 22, 1));
      }
      .w-card-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: 9px;
        border: 1px solid var(--w-line-2);
        background: #0b0c0f;
        color: var(--w-gold-2);
      }
      .w-card-body { flex: 1; min-width: 0; }
      .w-card-top { display: flex; align-items: center; gap: 8px; }
      .w-card-num { font-family: var(--font-mono); font-size: 10px; color: var(--w-muted); }
      .w-card-name { font-size: 12.5px; font-weight: 600; }
      .w-card-check { width: 14px; height: 14px; margin-left: auto; color: var(--w-gold-2); }
      .w-card-hint { margin-top: 2px; font-size: 11.5px; color: rgba(242, 241, 236, 0.78); }
      .w-card-foot {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        margin-top: 8px;
        font-size: 10.5px;
        color: var(--w-muted);
      }

      /* ---------- Toasts ---------- */
      .w-toast {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        border-radius: 16px;
        border: 1px solid rgba(242, 184, 75, 0.45);
        background: rgba(13, 14, 18, 0.96);
        box-shadow: 0 20px 40px -16px rgba(0, 0, 0, 0.8);
        font-size: 12px;
        color: var(--w-text);
      }
      .w-toast[data-tone='armed'] { border-color: rgba(184, 240, 90, 0.55); }
      .w-toast[data-tone='armed'] .w-toast-title { color: var(--w-green); }
      .w-toast[data-tone='warn'] { border-color: rgba(255, 122, 107, 0.6); }
      .w-toast[data-tone='warn'] .w-toast-title { color: #ff7a6b; }
      .w-toast-title { font-weight: 600; }
      .w-toast-desc { font-size: 11px; color: var(--w-muted); }
      .w-toast-x { background: none; border: 0; color: var(--w-muted); cursor: pointer; }
      .w-toast-x:hover { color: var(--w-text); }

      /* ---------- Landing Page (Matches 1st Image) ---------- */
      .w-landing {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(4, 5, 7, 0.62);
        animation: w-fade 0.35s ease;
      }
      .w-landing-card {
        position: relative;
        width: 100%;
        max-width: 440px;
        padding: 28px 34px 30px;
        border-radius: 26px;
        border: 1px solid rgba(255, 255, 255, 0.11);
        background: linear-gradient(180deg, #121318 0%, #090a0d 100%);
        box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        text-align: center;
        overflow: hidden;
      }
      .w-landing-glow {
        position: absolute;
        top: -65px;
        left: 50%;
        width: 300px;
        height: 190px;
        transform: translateX(-50%);
        background: radial-gradient(closest-side, rgba(242, 184, 75, 0.28), transparent);
        pointer-events: none;
      }
      .w-landing-figure {
        position: relative;
        display: block;
        width: 146px;
        height: 146px;
        margin: 0 auto;
        border-radius: 26px;
        object-fit: cover;
        background: #000;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
      }
      .w-landing-title {
        margin: 18px 0 0;
        font-family: var(--font-sans);
        font-size: 38px;
        font-weight: 700;
        letter-spacing: -0.01em;
        background: var(--w-gold-grad);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        line-height: 1.05;
      }
      .w-landing-tagline { margin: 8px 0 0; font-size: 14px; color: #b5b4ae; }
      .w-landing-desc { margin: 16px auto 0; max-width: 300px; font-size: 11.5px; line-height: 1.55; color: #8f8e8a; }
      .w-landing-begin {
        margin-top: 22px;
        border: 0;
        border-radius: 12px;
        padding: 10px 26px;
        background: var(--w-gold-grad);
        color: #1a1408;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 0 28px -4px rgba(242, 184, 75, 0.68);
        transition: transform 0.15s ease, filter 0.15s ease;
      }
      .w-landing-begin:hover { transform: translateY(-1px); filter: brightness(1.06); }

      @keyframes w-spin { to { transform: rotate(360deg); } }
      @keyframes w-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      @keyframes w-fade { from { opacity: 0; } to { opacity: 1; } }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScepterShellComponent implements AfterViewInit {
  @ViewChild('webcamVideo', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('viewportContainer', { static: true }) viewportRef!: ElementRef<HTMLElement>;
  @ViewChild('pipHostSlot', { static: true }) pipHostSlotRef!: ElementRef<HTMLElement>;

  readonly store = inject(WaveViewModelStore);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  /** Landing overlay is shown on load; clicking Begin opens the app and starts the camera. */
  readonly entered = signal<boolean>(false);

  readonly pipSupported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  /** 6-card grid combining the 5 core practice gestures + Wave Scenes (🤘 Rock-On / 🤙 Shaka). */
  readonly sixMovesCards = computed<MoveDisplayCard[]>(() => {
    const p = this.store.practiceProgress();
    const scenesDone =
      this.store.lastSceneResult() !== null || this.store.scenes().length > 0;
    return [
      {
        id: 'hover',
        num: '01',
        name: 'Move',
        hint: 'Open hand toward the camera, move it',
        does: 'Cursor follows',
        icon: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
        done: p.hover
      },
      {
        id: 'grab',
        num: '02',
        name: 'Pinch & grab',
        hint: 'Pinch thumb + index. Hold to drag',
        does: 'Grabs window',
        icon: 'M22 14a8 8 0 0 1-8 8M18 11v-1a2 2 0 0 0-4 0M14 10V9a2 2 0 0 0-4 0v1M10 9.5V4a2 2 0 0 0-4 0v10M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
        done: p.grab
      },
      {
        id: 'snap',
        num: '03',
        name: 'Snap to edge',
        hint: 'Drag to a screen edge, release pinch',
        does: 'Snaps window zone',
        icon: 'M3 3h18v18H3zM12 3v18M3 12h9',
        done: p.snap
      },
      {
        id: 'scenes',
        num: '04',
        name: 'Wave Scenes',
        hint: 'Hold 🤘 Rock-On or 🤙 Shaka sign',
        does: 'Launches workspace',
        icon: 'M12 3l1.9 5.8L20 10.8l-6.1 1.9L12 18.5l-1.9-5.8L4 10.8l6.1-2z',
        done: scenesDone
      },
      {
        id: 'scroll',
        num: '05',
        name: 'Scroll',
        hint: 'Peace sign ✌️, move up or down',
        does: 'Scrolls the page',
        icon: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
        done: p.scroll
      },
      {
        id: 'switch',
        num: '06',
        name: 'Switch apps',
        hint: 'Sideways open palm, swipe up',
        does: 'Alt+Tab',
        icon: 'M3 5h18v14H3zM3 9h18',
        done: p.switch
      }
    ];
  });

  readonly sixMovesCompletedCount = computed<number>(() =>
    this.sixMovesCards().reduce((acc, card) => acc + (card.done ? 1 : 0), 0)
  );

  private simPointer: Point2D | null = null;
  private simMouseDown = false;
  private simShiftDown = false;
  private simRafId: number | null = null;

  private readonly onVisibilityChangeBound = () => {
    if (typeof document === 'undefined') return;
    if (this.store.isPipActive()) {
      this.store.setTabHidden(false);
      return;
    }
    if (document.hidden && this.store.cameraStatus() === 'active') {
      this.store.setTabHidden(true);
    } else if (!document.hidden) {
      this.store.setTabHidden(false);
    }
  };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
    }

    this.destroyRef.onDestroy(() => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);
      }
      this.stopSimulationLoop();
      this.store.stopCamera(this.videoRef?.nativeElement);
    });
  }

  ngAfterViewInit(): void {
    // Landing overlay is displayed until the user clicks Begin.
  }

  begin(): void {
    this.entered.set(true);
    void this.startCamera();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.simShiftDown = true;
    }

    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (!this.entered() && event.key === 'Enter') {
      event.preventDefault();
      this.begin();
      return;
    }

    if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      this.store.toggleSettingsDrawer();
    } else if (event.key === 'w' || event.key === 'W') {
      if (this.store.scenesEnabled()) {
        event.preventDefault();
        this.store.toggleScenesDrawer();
      }
    } else if (event.key === 'u' || event.key === 'U') {
      if (this.store.scenesEnabled() && this.store.undoAvailable()) {
        event.preventDefault();
        void this.store.undoLastScene();
      }
    } else if (event.key === '3' || event.key === '4') {
      if (this.store.simulationMode() && this.store.scenesEnabled()) {
        event.preventDefault();
        const fingers = event.key === '3' ? 3 : 4;
        void this.store.triggerSceneGesture(fingers);
      }
    } else if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      this.store.toggleMute();
    } else if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      this.store.toggleGuideModal();
    } else if (event.key === 'Escape') {
      this.store.toggleGuideModal(false);
      this.store.toggleSettingsDrawer(false);
      this.store.toggleScenesDrawer(false);
      this.store.toggleSaveSceneModal(false);
    }
  }

  @HostListener('window:keyup', ['$event'])
  onWindowKeyUp(event: KeyboardEvent): void {
    if (event.key === 'Shift') {
      this.simShiftDown = false;
    }
  }

  async startCamera(): Promise<void> {
    this.stopSimulationLoop();
    await this.store.startCamera(this.videoRef.nativeElement);
  }

  stopCamera(): void {
    this.store.stopCamera(this.videoRef.nativeElement);
  }

  toggleCamera(): void {
    if (this.store.cameraStatus() === 'active') {
      this.stopCamera();
    } else {
      void this.startCamera();
    }
  }

  enableSimulationMode(): void {
    if (!this.store.simulationMode()) {
      this.toggleSimulationMode();
    }
  }

  toggleSimulationMode(): void {
    if (this.store.simulationMode()) {
      this.stopSimulationLoop();
      this.store.disableSimulationMode();
    } else {
      this.store.enableSimulationMode(this.videoRef.nativeElement);
      this.startSimulationLoop();
    }
  }

  onSimPointerDown(event: PointerEvent): void {
    if (!this.store.simulationMode()) return;
    this.simMouseDown = true;
    this.simShiftDown = event.shiftKey;
    this.updateSimPointerFromEvent(event);
  }

  onSimPointerMove(event: PointerEvent): void {
    if (!this.store.simulationMode()) return;
    this.simShiftDown = event.shiftKey;
    this.updateSimPointerFromEvent(event);
  }

  onSimPointerUp(event: PointerEvent): void {
    if (!this.store.simulationMode()) return;
    this.simMouseDown = false;
    this.simShiftDown = event.shiftKey;
    this.updateSimPointerFromEvent(event);
  }

  onSimPointerLeave(): void {
    if (!this.store.simulationMode()) return;
    this.simMouseDown = false;
    this.simShiftDown = false;
    this.simPointer = null;
  }

  async toggleDocumentPiP(): Promise<void> {
    if (!this.pipSupported) return;

    try {
      const pipApi = (window as unknown as { documentPictureInPicture: any })
        .documentPictureInPicture;

      if (pipApi.window) {
        pipApi.window.close();
        return;
      }

      const pipWindow: Window = await pipApi.requestWindow({
        width: 480,
        height: 340
      });

      // Keep exact title "WAVEHUD" so the Win32 backend ignores the PiP window too
      pipWindow.document.title = 'WAVEHUD';
      pipWindow.document.documentElement.style.height = '100%';
      pipWindow.document.documentElement.style.width = '100%';
      pipWindow.document.body.style.margin = '0';
      pipWindow.document.body.style.padding = '0';
      pipWindow.document.body.style.width = '100vw';
      pipWindow.document.body.style.height = '100vh';
      pipWindow.document.body.style.display = 'flex';
      pipWindow.document.body.style.flexDirection = 'column';
      pipWindow.document.body.style.background = '#060911';
      pipWindow.document.body.style.overflow = 'hidden';

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

      const viewportEl = this.viewportRef.nativeElement;
      viewportEl.style.width = '100vw';
      viewportEl.style.height = '100vh';
      viewportEl.style.flex = '1 1 auto';
      pipWindow.document.body.appendChild(viewportEl);
      this.store.isPipActive.set(true);
      this.store.setTabHidden(false);

      const videoEl = this.videoRef.nativeElement;
      if (!this.store.simulationMode() && videoEl.paused && videoEl.srcObject) {
        void videoEl.play().catch(() => {});
      }

      pipWindow.addEventListener('pagehide', () => {
        this.ngZone.run(() => {
          viewportEl.style.width = '';
          viewportEl.style.height = '';
          viewportEl.style.flex = '';
          this.pipHostSlotRef.nativeElement.appendChild(viewportEl);
          this.store.isPipActive.set(false);
          if (!this.store.simulationMode() && videoEl.paused && videoEl.srcObject) {
            void videoEl.play().catch(() => {});
          }
        });
      });
    } catch {
      this.store.toggleCompactMode(true);
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

    this.ngZone.runOutsideAngular(() => {
      const tick = (nowMs: number) => {
        if (!this.store.simulationMode()) return;

        this.store.processSimulationStep(
          this.simPointer,
          this.simMouseDown,
          nowMs,
          this.simShiftDown
        );

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
}
