import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  NgZone,
  ViewChild,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Point2D } from '../../core/models/landmark.model';
import { WaveViewModelStore } from '../../core/services/wave-view-model.store';
import { HudOverlayComponent } from '../hud-overlay/hud-overlay.component';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component';

@Component({
  selector: 'app-scepter-shell',
  standalone: true,
  imports: [CommonModule, HudOverlayComponent, SettingsPanelComponent],
  template: `
    <div
      class="flex h-screen w-screen flex-col overflow-hidden bg-void text-foreground select-none"
      [ngClass]="store.compactMode() ? 'p-2 gap-2' : 'p-3 sm:p-5 gap-3'">
      <!-- Screen-reader live region for state & practice announcements -->
      <div class="sr-only" aria-live="polite" aria-atomic="true">
        {{ store.ariaAnnouncement() }}
      </div>

      <!-- HEADER -->
      <header class="flex items-center justify-between gap-2 flex-wrap">
        <!-- Brand Wordmark & Tagline -->
        <div class="flex items-center gap-3">
          <div
            class="relative flex h-9 w-9 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 glow-gold"
            aria-hidden="true">
            <svg viewBox="0 0 32 32" class="h-5 w-5" fill="none">
              <g
                stroke="currentColor"
                class="text-primary"
                stroke-width="1.5"
                stroke-linecap="round">
                <line x1="16" y1="26" x2="10" y2="18" />
                <line x1="10" y1="18" x2="7" y2="9" />
                <line x1="16" y1="26" x2="14" y2="16" />
                <line x1="14" y1="16" x2="13" y2="5" />
                <line x1="16" y1="26" x2="18" y2="16" />
                <line x1="18" y1="16" x2="19" y2="6" />
                <line x1="16" y1="26" x2="22" y2="18" />
                <line x1="22" y1="18" x2="25" y2="10" />
              </g>
              <g class="fill-gold-bright">
                <circle cx="16" cy="26" r="2" />
                <circle cx="7" cy="9" r="1.8" />
                <circle cx="13" cy="5" r="2" />
                <circle cx="19" cy="6" r="1.8" />
                <circle cx="25" cy="10" r="1.6" />
              </g>
            </svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span
                class="font-display text-xl font-bold tracking-tight text-gold-gradient leading-none">
                W.A.V.E
              </span>
              <span
                *ngIf="store.simulationMode()"
                class="rounded-full border border-primary/50 bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                Simulation Active
              </span>
            </div>
            <p
              class="text-[11px] text-muted-foreground tracking-wider uppercase font-mono mt-0.5">
              Windows Are Very Easily-moved
            </p>
          </div>
        </div>

        <!-- Right Header Controls -->
        <div class="flex items-center gap-2 flex-wrap justify-end">
          <!-- Backend Status Pill -->
          <div
            class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono border transition-colors"
            [ngClass]="{
              'border-glass-border bg-secondary/60 text-muted-foreground':
                store.backendStatus() === 'checking',
              'border-armed/40 bg-armed/10 text-armed':
                store.backendStatus() === 'connected',
              'border-destructive/50 bg-destructive/10 text-destructive':
                store.backendStatus() === 'unreachable'
            }"
            role="status"
            aria-label="Backend status">
            <svg
              *ngIf="store.backendStatus() === 'checking'"
              viewBox="0 0 24 24"
              class="h-3 w-3 animate-spin"
              fill="none"
              stroke="currentColor"
              stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" />
            </svg>
            <span
              *ngIf="store.backendStatus() === 'connected'"
              class="h-2 w-2 rounded-full bg-armed shadow-[0_0_8px_var(--armed)]"></span>
            <span
              *ngIf="store.backendStatus() === 'unreachable'"
              class="h-2 w-2 rounded-full bg-destructive animate-pulse"></span>
            <span>
              {{
                store.backendStatus() === 'checking'
                  ? 'Checking…'
                  : store.backendStatus() === 'connected'
                    ? 'Backend connected'
                    : 'Backend unreachable'
              }}
            </span>
          </div>

          <!-- Live Control Toggle (Adapted from reference Air Mouse toggle) -->
          <button
            type="button"
            (click)="store.toggleLiveControl()"
            [attr.aria-pressed]="store.liveControl()"
            aria-label="Toggle Live control mode"
            title="Toggle Live control (Off = Practice mode, On = Control real Windows)"
            class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono border transition cursor-pointer"
            [ngClass]="
              store.liveControl()
                ? 'border-armed/60 bg-armed/15 text-armed shadow-[0_0_16px_oklch(0.78_0.17_155_/_0.25)]'
                : 'border-glass-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:border-primary/40'
            ">
            <span
              class="h-2 w-2 rounded-full"
              [ngClass]="
                store.liveControl()
                  ? 'bg-armed shadow-[0_0_8px_var(--armed)]'
                  : 'bg-muted-foreground'
              "></span>
            <span>{{ store.liveControl() ? 'Live control on' : 'Live control off' }}</span>
          </button>

          <!-- Simulation Mode Toggle -->
          <button
            type="button"
            (click)="toggleSimulationMode()"
            [attr.aria-pressed]="store.simulationMode()"
            aria-label="Toggle Mouse Simulation mode"
            title="Toggle Mouse Simulation mode (Click = Pinch, Drag = Move, Shift + Move = V-Sign Scroll)"
            class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono border transition cursor-pointer"
            [ngClass]="
              store.simulationMode()
                ? 'border-primary/60 bg-primary/15 text-primary shadow-[0_0_14px_oklch(0.78_0.16_75_/_0.25)]'
                : 'border-glass-border bg-secondary/60 text-muted-foreground hover:text-foreground hover:border-primary/40'
            ">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="6" y="3" width="12" height="18" rx="6" />
              <line x1="12" y1="7" x2="12" y2="11" stroke-linecap="round" />
            </svg>
            <span>{{ store.simulationMode() ? 'Simulating' : 'Simulate' }}</span>
          </button>

          <!-- Camera Start / Stop Icon Button -->
          <button
            type="button"
            (click)="toggleCamera()"
            [attr.aria-label]="
              store.cameraStatus() === 'active' ? 'Stop camera' : 'Start camera'
            "
            [title]="store.cameraStatus() === 'active' ? 'Stop camera' : 'Start camera'"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass-border bg-secondary/50 text-foreground transition hover:border-primary/40 hover:bg-secondary cursor-pointer">
            <svg
              *ngIf="store.cameraStatus() === 'active'"
              viewBox="0 0 24 24"
              class="h-4 w-4 text-primary"
              fill="none"
              stroke="currentColor"
              stroke-width="2">
              <path d="m22 8-6 4 6 4V8Z" stroke-linecap="round" stroke-linejoin="round" />
              <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
            </svg>
            <svg
              *ngIf="store.cameraStatus() !== 'active'"
              viewBox="0 0 24 24"
              class="h-4 w-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              stroke-width="2">
              <path d="M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.062A.5.5 0 0 1 22 7.87v8.196" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="2" y1="2" x2="22" y2="22" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Always-on-Top PiP Button -->
          <button
            *ngIf="pipSupported"
            type="button"
            (click)="toggleDocumentPiP()"
            [attr.aria-pressed]="store.isPipActive()"
            aria-label="Pop out HUD in always-on-top Picture-in-Picture window"
            title="Pop out Always-on-Top HUD"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass-border bg-secondary/50 text-foreground transition hover:border-primary/40 hover:bg-secondary cursor-pointer"
            [ngClass]="{ 'border-primary/60 text-primary': store.isPipActive() }">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 4.5v5H3m-1-6 6 6m13 0v-3c0-1.16-.84-2-2-2h-7m-9 9v2c0 1.05.95 2 2 2h3" stroke-linecap="round" stroke-linejoin="round" />
              <rect width="10" height="7" x="12" y="13.5" rx="2" />
            </svg>
          </button>

          <!-- Compact Mode Toggle Button -->
          <button
            type="button"
            (click)="store.toggleCompactMode()"
            [attr.aria-pressed]="store.compactMode()"
            aria-label="Toggle compact stage mode"
            title="Toggle compact mode"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass-border bg-secondary/50 text-foreground transition hover:border-primary/40 hover:bg-secondary cursor-pointer"
            [ngClass]="{ 'border-primary/60 text-primary': store.compactMode() }">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 14 10 14 10 20" stroke-linecap="round" stroke-linejoin="round" />
              <polyline points="20 10 14 10 14 4" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="14" y1="10" x2="21" y2="3" stroke-linecap="round" />
              <line x1="3" y1="21" x2="10" y2="14" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Sound Mute (M) Button -->
          <button
            type="button"
            (click)="store.toggleMute()"
            [attr.aria-pressed]="store.muted()"
            [attr.aria-label]="store.muted() ? 'Unmute sound cues' : 'Mute sound cues'"
            title="Toggle sound cues (M)"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass-border bg-secondary/50 text-foreground transition hover:border-primary/40 hover:bg-secondary cursor-pointer">
            <svg
              *ngIf="!store.muted()"
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke-linecap="round" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" stroke-linecap="round" />
            </svg>
            <svg
              *ngIf="store.muted()"
              viewBox="0 0 24 24"
              class="h-4 w-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke-linecap="round" stroke-linejoin="round" />
              <line x1="22" y1="9" x2="16" y2="15" stroke-linecap="round" />
              <line x1="16" y1="9" x2="22" y2="15" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Gesture Guide (C) Button -->
          <button
            type="button"
            (click)="store.toggleGuideModal(true)"
            aria-label="Open gesture guide"
            title="Gesture guide (C)"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass-border bg-secondary/50 text-foreground transition hover:border-primary/40 hover:bg-secondary cursor-pointer">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M12 17h.01" stroke-linecap="round" />
            </svg>
          </button>

          <!-- Settings Drawer (S) Button -->
          <button
            type="button"
            (click)="store.toggleSettingsDrawer(true)"
            aria-label="Open settings drawer"
            title="Settings (S)"
            class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass-border bg-secondary/50 text-foreground transition hover:border-primary/40 hover:bg-secondary cursor-pointer">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="21" x2="4" y2="14" stroke-linecap="round" />
              <line x1="4" y1="10" x2="4" y2="3" stroke-linecap="round" />
              <line x1="12" y1="21" x2="12" y2="12" stroke-linecap="round" />
              <line x1="12" y1="8" x2="12" y2="3" stroke-linecap="round" />
              <line x1="20" y1="21" x2="20" y2="16" stroke-linecap="round" />
              <line x1="20" y1="12" x2="20" y2="3" stroke-linecap="round" />
              <line x1="2" y1="14" x2="6" y2="14" stroke-linecap="round" />
              <line x1="10" y1="8" x2="14" y2="8" stroke-linecap="round" />
              <line x1="18" y1="16" x2="22" y2="16" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <!-- MAIN STAGE HOST (supports Document Picture-in-Picture reparenting) -->
      <div #pipHostSlot class="relative flex flex-1 min-h-[240px]">
        <!-- Placeholder shown in main tab when stage is popped out into Always-on-Top PiP -->
        <div
          *ngIf="store.isPipActive()"
          class="flex h-full w-full flex-col items-center justify-center rounded-[1.75rem] border border-glass-border glass p-6 text-center">
          <span
            class="mb-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-primary">
            Always-on-Top PiP Active
          </span>
          <h2 class="font-display text-lg font-semibold text-gold-gradient">
            W.A.V.E HUD is floating above your desktop
          </h2>
          <p class="mt-1 max-w-md text-xs text-muted-foreground">
            Focus any Windows app to snap or V-sign scroll it while the floating HUD stays active.
          </p>
          <button
            type="button"
            (click)="toggleDocumentPiP()"
            class="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90 cursor-pointer">
            Dock HUD back to tab
          </button>
        </div>

        <!-- INTERACTIVE STAGE -->
        <main
          #viewportContainer
          class="relative flex-1 min-h-[240px] h-full w-full rounded-[1.75rem] overflow-hidden border border-glass-border bg-background grid-lines shadow-2xl"
          [ngClass]="{
            'cursor-crosshair': store.simulationMode(),
            '!rounded-none !border-0 h-screen w-screen': store.isPipActive()
          }"
          (pointerdown)="onSimPointerDown($event)"
          (pointermove)="onSimPointerMove($event)"
          (pointerup)="onSimPointerUp($event)"
          (pointerleave)="onSimPointerLeave()">
          <!-- Mirrored Webcam Video -->
          <video
            #webcamVideo
            playsinline
            muted
            class="absolute inset-0 h-full w-full object-cover scale-x-[-1] transition-opacity duration-500"
            [ngClass]="
              !store.simulationMode() && store.cameraStatus() === 'active'
                ? 'opacity-90'
                : 'opacity-0 pointer-events-none'
            "></video>

          <!-- Subtle Stage Vignette -->
          <div
            class="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-background/30 pointer-events-none"></div>

          <!-- Canvas HUD Overlay (runs rAF loop outside Angular zone) -->
          <app-hud-overlay />

          <!-- Simulation Mode Helper Banner at Top-Center -->
          <div
            *ngIf="store.simulationMode()"
            class="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 hidden md:flex items-center gap-2 rounded-full border border-primary/40 glass px-3.5 py-1 font-mono text-[11px] text-primary">
            <span class="h-2 w-2 rounded-full bg-primary animate-pulse"></span>
            <span>
              SIMULATION · Click &amp; hold = Grab · Drag to edge &amp; release = Snap · Hold Shift + move = V-Scroll
            </span>
          </div>

          <!-- Top-Left: Gesture State Card (matches reference Wn) -->
          <div class="pointer-events-none absolute top-3 left-3 z-20 max-w-md">
            <div
              class="glass rounded-2xl flex items-center gap-3"
              [ngClass]="store.isPipActive() ? 'px-3 py-1.5' : 'px-4 py-2.5'">
              <div class="relative flex h-3 w-3 shrink-0 items-center justify-center">
                <span
                  *ngIf="store.gestureState() !== 'IDLE'"
                  class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                  [ngClass]="{
                    'bg-primary': store.stateMeta().tone === 'gold',
                    'bg-gold-bright': store.stateMeta().tone === 'gold-bright',
                    'bg-armed': store.stateMeta().tone === 'armed'
                  }"></span>
                <span
                  class="relative inline-flex h-2.5 w-2.5 rounded-full"
                  [ngClass]="{
                    'bg-idle': store.stateMeta().tone === 'idle',
                    'bg-primary': store.stateMeta().tone === 'gold',
                    'bg-gold-bright': store.stateMeta().tone === 'gold-bright',
                    'bg-armed': store.stateMeta().tone === 'armed'
                  }"></span>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <span
                    class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    State
                  </span>
                  <span
                    class="font-display text-sm font-semibold tracking-tight"
                    [ngClass]="{
                      'text-muted-foreground': store.stateMeta().tone === 'idle',
                      'text-primary': store.stateMeta().tone === 'gold',
                      'text-gold-bright': store.stateMeta().tone === 'gold-bright',
                      'text-armed': store.stateMeta().tone === 'armed'
                    }">
                    {{ store.stateMeta().label }}
                  </span>
                  <span
                    *ngIf="
                      (store.gestureState() === 'GRABBING' ||
                        store.gestureState() === 'DRAGGING') &&
                      store.grabbedWindowTitle()
                    "
                    class="truncate max-w-[160px] rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                    {{ store.grabbedWindowTitle() }}
                  </span>
                </div>
                <p
                  *ngIf="!store.isPipActive()"
                  class="text-xs text-muted-foreground leading-snug">
                  {{ store.stateMeta().hint }}
                </p>
              </div>
            </div>
          </div>

          <!-- Top-Right: Contextual Warning Banners (Backend Unreachable / Tab Hidden) -->
          <div class="absolute top-3 right-3 z-20 flex flex-col gap-2 max-w-xs">
            <!-- Backend Unreachable Alert when Live Control is ON -->
            <div
              *ngIf="store.liveControl() && store.backendStatus() === 'unreachable'"
              class="glass rounded-xl p-3 border border-destructive/50 text-xs flex items-start gap-2.5">
              <svg
                viewBox="0 0 24 24"
                class="h-4 w-4 text-destructive shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2">
                <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" stroke-linecap="round" />
              </svg>
              <div class="flex-1">
                <div class="font-semibold text-foreground">Backend unreachable</div>
                <p class="text-muted-foreground mt-0.5">
                  Start the local W.A.V.E backend on <code>localhost:5000</code> or switch off Live control to practice.
                </p>
                <button
                  type="button"
                  (click)="store.retryBackendHealth()"
                  class="mt-2 inline-flex items-center gap-1 text-primary hover:underline font-mono text-[11px] cursor-pointer">
                  <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke-linecap="round" />
                    <path d="M21 3v5h-5" stroke-linecap="round" />
                  </svg>
                  Retry
                </button>
              </div>
            </div>

            <!-- Tab Hidden Warning -->
            <div
              *ngIf="store.tabHidden() && !store.isPipActive()"
              class="glass rounded-xl p-3 border border-primary/50 text-xs flex items-start gap-2.5">
              <svg
                viewBox="0 0 24 24"
                class="h-4 w-4 text-primary shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" y1="2" x2="22" y2="22" stroke-linecap="round" />
              </svg>
              <div class="flex-1">
                <div class="font-semibold text-foreground">Tab was in the background</div>
                <p class="text-muted-foreground mt-0.5">
                  Browsers pause camera frames in hidden tabs. Keep W.A.V.E visible or pop out the PiP HUD.
                </p>
                <button
                  type="button"
                  (click)="store.setTabHidden(false)"
                  class="mt-1.5 text-primary hover:underline font-mono text-[11px] cursor-pointer">
                  Got it
                </button>
              </div>
            </div>
          </div>

          <!-- Center Stage Overlay: Turn on camera to start (matches reference Yr) -->
          <div
            *ngIf="!store.simulationMode() && store.cameraStatus() === 'idle'"
            class="absolute inset-0 z-20 flex items-center justify-center p-6">
            <div class="glass-strong rounded-3xl p-8 max-w-md text-center space-y-5 border border-primary/30">
              <div class="relative mx-auto h-16 w-16 flex items-center justify-center">
                <div class="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse-gold"></div>
                <div
                  class="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/50 bg-primary/10">
                  <svg
                    viewBox="0 0 24 24"
                    class="h-7 w-7 text-primary"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2">
                    <path d="m22 8-6 4 6 4V8Z" stroke-linecap="round" stroke-linejoin="round" />
                    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                  </svg>
                </div>
              </div>
              <div class="space-y-2">
                <h2 class="font-display text-2xl font-bold tracking-tight text-gold-gradient">
                  Turn on your camera to start
                </h2>
                <p class="text-sm text-muted-foreground leading-relaxed">
                  Video never leaves your device. Practice every gesture here before taking over your desktop.
                </p>
              </div>
              <div class="flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  type="button"
                  (click)="startCamera()"
                  class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 font-display text-sm font-semibold text-primary-foreground glow-gold transition hover:bg-primary/90 cursor-pointer">
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m22 8-6 4 6 4V8Z" stroke-linecap="round" stroke-linejoin="round" />
                    <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                  </svg>
                  Start camera
                </button>
                <button
                  type="button"
                  (click)="enableSimulationMode()"
                  class="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-glass-border bg-secondary/70 px-4 py-2.5 text-xs font-medium text-foreground transition hover:border-primary/40 cursor-pointer">
                  Use Mouse Simulation
                </button>
              </div>
            </div>
          </div>

          <!-- Center Stage Overlay: Camera Loading / Permission Denied / Missing / Error (matches reference Kr) -->
          <div
            *ngIf="
              !store.simulationMode() &&
              store.cameraStatus() !== 'idle' &&
              (store.cameraStatus() !== 'active' || store.trackerStatus() !== 'ready')
            "
            class="absolute inset-0 z-20 flex items-center justify-center p-6">
            <div class="glass-strong rounded-3xl p-8 max-w-md text-center space-y-4 border border-glass-border">
              <!-- Loading Spinner -->
              <ng-container
                *ngIf="
                  store.cameraStatus() === 'requesting' ||
                  store.trackerStatus() === 'loading'
                ">
                <svg
                  viewBox="0 0 24 24"
                  class="h-10 w-10 text-primary mx-auto animate-spin"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" />
                </svg>
                <h3 class="font-display text-xl font-semibold text-foreground">
                  {{
                    store.cameraStatus() === 'requesting'
                      ? 'Starting camera…'
                      : 'Loading hand-tracking model…'
                  }}
                </h3>
                <p class="text-sm text-muted-foreground leading-relaxed">
                  {{
                    store.cameraStatus() === 'requesting'
                      ? 'Approve the browser camera prompt if one appears.'
                      : 'Warming up MediaPipe Hand Landmarker in your browser (runs 100% locally).'
                  }}
                </p>
              </ng-container>

              <!-- Denied / Missing / Error -->
              <ng-container
                *ngIf="
                  store.cameraStatus() === 'denied' ||
                  store.cameraStatus() === 'missing' ||
                  store.cameraStatus() === 'error' ||
                  store.trackerStatus() === 'error'
                ">
                <svg
                  viewBox="0 0 24 24"
                  class="h-10 w-10 text-destructive mx-auto"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" stroke-linecap="round" />
                  <line x1="12" y1="16" x2="12.01" y2="16" stroke-linecap="round" />
                </svg>
                <h3 class="font-display text-xl font-semibold text-foreground">
                  {{
                    store.cameraStatus() === 'denied'
                      ? 'Camera access was blocked'
                      : store.cameraStatus() === 'missing'
                        ? 'No camera detected'
                        : 'Camera error'
                  }}
                </h3>
                <p class="text-sm text-muted-foreground leading-relaxed">
                  {{
                    store.cameraError() ||
                      'Could not start the webcam. You can retry or switch to Mouse Simulation mode.'
                  }}
                </p>
                <div class="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    (click)="startCamera()"
                    class="inline-flex items-center gap-2 rounded-xl border border-glass-border bg-secondary px-4 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 cursor-pointer">
                    Try again
                  </button>
                  <button
                    type="button"
                    (click)="enableSimulationMode()"
                    class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 cursor-pointer">
                    Switch to Simulation Mode
                  </button>
                </div>
              </ng-container>
            </div>
          </div>

          <!-- Bottom-Right Stats / Telemetry Card (matches reference qn) -->
          <div class="pointer-events-none absolute bottom-3 right-3 left-3 sm:left-auto z-20 flex justify-end">
            <div class="glass rounded-2xl px-4 py-2.5 flex items-center gap-4 text-xs font-mono flex-wrap">
              <!-- Gesture State Chip -->
              <div class="flex items-center gap-1.5">
                <span class="text-muted-foreground uppercase text-[10px]">Mode</span>
                <span
                  class="rounded px-1.5 py-0.5 font-semibold text-[11px]"
                  [ngClass]="{
                    'bg-secondary text-muted-foreground': store.stateMeta().tone === 'idle',
                    'bg-primary/15 text-primary': store.stateMeta().tone === 'gold',
                    'bg-primary/25 text-gold-bright': store.stateMeta().tone === 'gold-bright',
                    'bg-armed/20 text-armed': store.stateMeta().tone === 'armed'
                  }">
                  {{ store.stateMeta().chip }}
                </span>
              </div>
              <div class="h-4 w-px bg-glass-border"></div>
              <!-- FPS -->
              <div>
                <span class="text-muted-foreground uppercase text-[10px]">FPS</span>
                <span class="ml-1.5 text-foreground font-semibold tabular-nums">
                  {{
                    store.cameraStatus() === 'active' || store.simulationMode()
                      ? store.fps()
                      : '—'
                  }}
                </span>
              </div>
              <div class="h-4 w-px bg-glass-border"></div>
              <!-- 5-Bar Tracking Quality -->
              <div class="flex items-center gap-1.5" title="Tracking confidence">
                <span class="text-muted-foreground uppercase text-[10px]">Tracking</span>
                <div class="flex items-end gap-0.5 h-3">
                  <span
                    *ngFor="let lit of store.confidenceBars(); let i = index"
                    class="w-1 rounded-sm transition-colors"
                    [style.height.px]="4 + i * 2"
                    [ngClass]="lit ? 'bg-primary' : 'bg-muted'"></span>
                </div>
              </div>
              <div class="h-4 w-px bg-glass-border"></div>
              <!-- Last Action -->
              <div class="max-w-[200px] truncate">
                <span class="text-muted-foreground uppercase text-[10px]">Last</span>
                <span class="ml-1.5 text-primary font-semibold">
                  {{ store.lastResult() || '—' }}
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>

      <!-- PRACTICE CHECKLIST & 4 GESTURE CARDS (collapses automatically once 4/4 completed) -->
      <section
        *ngIf="!store.compactMode()"
        class="glass rounded-2xl transition-all"
        [ngClass]="store.practiceCollapsed() ? 'px-3 py-2' : 'p-3'"
        aria-label="Practice checklist">
        <div
          class="flex items-center justify-between gap-2 px-1"
          [ngClass]="{ 'mb-2': !store.practiceCollapsed() }">
          <div class="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 text-primary"
              fill="none"
              stroke="currentColor"
              stroke-width="2">
              <path
                d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
                stroke-linecap="round"
                stroke-linejoin="round" />
            </svg>
            <span class="font-mono text-xs uppercase tracking-widest text-primary">
              Practice · {{ store.practiceCompletedCount() }}/{{ store.practiceCards.length }}
            </span>
            <span
              *ngIf="store.practiceCompletedCount() === store.practiceCards.length"
              class="text-xs text-armed font-medium">
              All gestures mastered ✨
            </span>
          </div>
          <div class="flex items-center gap-3">
            <button
              type="button"
              (click)="store.togglePracticeCollapsed()"
              class="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition cursor-pointer">
              {{ store.practiceCollapsed() ? 'Show cards' : 'Collapse' }}
            </button>
            <button
              type="button"
              (click)="store.resetPractice()"
              class="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition cursor-pointer">
              <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke-linecap="round" />
                <path d="M3 3v5h5" stroke-linecap="round" />
              </svg>
              Reset
            </button>
          </div>
        </div>

        <div
          *ngIf="!store.practiceCollapsed()"
          class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div
            *ngFor="let card of store.practiceCards"
            class="rounded-xl px-3 py-2 border transition flex items-start gap-2.5"
            [ngClass]="
              store.practiceProgress()[card.id]
                ? 'border-armed/60 bg-armed/10'
                : 'border-glass-border bg-secondary/40'
            ">
            <div
              class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition"
              [ngClass]="
                store.practiceProgress()[card.id]
                  ? 'border-armed bg-armed text-background'
                  : 'border-muted-foreground/40'
              ">
              <svg
                *ngIf="store.practiceProgress()[card.id]"
                viewBox="0 0 24 24"
                class="h-2.5 w-2.5"
                fill="none"
                stroke="currentColor"
                stroke-width="3">
                <polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div class="min-w-0">
              <div class="font-display text-xs font-semibold text-foreground leading-tight">
                {{ card.name }}
              </div>
              <div class="text-[11px] text-muted-foreground leading-tight mt-0.5">
                {{ card.hint }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- FOOTER -->
      <footer
        class="flex items-center justify-between text-[11px] text-muted-foreground font-mono px-1 flex-wrap gap-2">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full bg-armed"></span>
          Video never leaves your device.
        </span>
        <span>
          {{
            store.liveControl()
              ? 'Live control is moving your real Windows apps.'
              : 'Practice mode: turn on Live control to control your computer.'
          }}
        </span>
      </footer>

      <!-- BOTTOM-CENTER TOAST NOTIFICATIONS -->
      <div
        *ngIf="store.toasts().length > 0"
        class="pointer-events-none fixed bottom-12 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        <div
          *ngFor="let toast of store.toasts()"
          class="pointer-events-auto glass-strong flex items-center gap-3 rounded-2xl border px-4 py-2.5 text-xs shadow-2xl transition-all"
          [ngClass]="{
            'border-primary/50 text-foreground': toast.tone === 'gold' || toast.tone === 'info',
            'border-armed/60 text-armed': toast.tone === 'armed',
            'border-destructive/60 text-destructive': toast.tone === 'warn'
          }">
          <div>
            <div class="font-display font-semibold">{{ toast.title }}</div>
            <div *ngIf="toast.description" class="text-[11px] text-muted-foreground">
              {{ toast.description }}
            </div>
          </div>
          <button
            type="button"
            (click)="store.dismissToast(toast.id)"
            aria-label="Dismiss notification"
            class="text-muted-foreground hover:text-foreground cursor-pointer">
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
          class="fixed inset-0 bg-background/75 backdrop-blur-sm"
          (click)="store.toggleGuideModal(false)"
          aria-hidden="true"></div>
        <div
          class="relative z-10 w-full max-w-lg rounded-3xl border border-glass-border glass-strong p-6 text-foreground shadow-2xl space-y-5">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-center gap-3">
              <img
                src="assets/wave-logo.png"
                alt="W.A.V.E emblem"
                class="h-12 w-12 rounded-2xl border border-primary/40 object-cover" />
              <div>
                <h2
                  id="wave-guide-title"
                  class="font-display text-xl font-bold text-gold-gradient">
                  W.A.V.E Gesture Guide
                </h2>
                <p class="text-xs text-muted-foreground">
                  Four spatial gestures to move, snap, and scroll your Windows desktop.
                </p>
              </div>
            </div>
            <button
              type="button"
              (click)="store.toggleGuideModal(false)"
              aria-label="Close gesture guide"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass-border bg-secondary/60 text-muted-foreground hover:text-foreground cursor-pointer">
              ✕
            </button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              *ngFor="let card of store.practiceCards"
              class="rounded-2xl border border-glass-border bg-secondary/40 p-3.5">
              <div class="font-display text-sm font-semibold text-primary">
                {{ card.name }}
              </div>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ card.hint }}
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-glass-border bg-secondary/30 p-3.5 text-xs text-muted-foreground space-y-1">
            <div class="font-semibold text-foreground">Keyboard Shortcuts &amp; Simulation</div>
            <p>
              Press <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">S</kbd> for Settings,
              <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">M</kbd> to Mute sound cues, or
              <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">C</kbd> for this guide.
              In Simulation mode, hold <kbd class="rounded bg-secondary px-1.5 py-0.5 font-mono text-foreground">Shift</kbd> while moving the mouse up or down to emulate a V-sign scroll.
            </p>
          </div>

          <div class="flex justify-end">
            <button
              type="button"
              (click)="store.toggleGuideModal(false)"
              class="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 cursor-pointer">
              Got it
            </button>
          </div>
        </div>
      </div>

      <!-- SETTINGS DRAWER -->
      <app-settings-panel />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScepterShellComponent implements AfterViewInit {
  @ViewChild('webcamVideo', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('viewportContainer', { static: true }) viewportRef!: ElementRef<HTMLElement>;
  @ViewChild('pipHostSlot', { static: true }) pipHostSlotRef!: ElementRef<HTMLElement>;

  readonly store = inject(WaveViewModelStore);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  readonly pipSupported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

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
    // Camera starts in 'idle' showing the "Turn on your camera to start" card matching the reference UI.
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

    if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      this.store.toggleSettingsDrawer();
    } else if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      this.store.toggleMute();
    } else if (event.key === 'c' || event.key === 'C') {
      event.preventDefault();
      this.store.toggleGuideModal();
    } else if (event.key === 'Escape') {
      this.store.toggleGuideModal(false);
      this.store.toggleSettingsDrawer(false);
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
