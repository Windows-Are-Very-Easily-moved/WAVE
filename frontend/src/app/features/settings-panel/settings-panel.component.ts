import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FilterType } from '../../core/models/gesture.model';
import { WaveViewModelStore } from '../../core/services/wave-view-model.store';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div
      *ngIf="store.settingsOpen()"
      class="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wave-settings-title">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 transition-opacity"
        style="background: rgba(5, 7, 13, 0.92); backdrop-filter: blur(8px);"
        (click)="close()"
        aria-hidden="true"></div>

      <!-- Slide-over Sheet -->
      <aside
        (wheel)="$event.stopPropagation()"
        style="background: #0d111a; border-left: 1px solid #2b3548;"
        class="relative z-10 flex h-full w-full flex-col justify-between overflow-y-auto p-6 text-foreground shadow-2xl sm:max-w-md">
        <div class="space-y-6">
          <!-- Sheet Header -->
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2
                id="wave-settings-title"
                class="font-display text-xl font-semibold tracking-tight text-gold-gradient">
                W.A.V.E Settings
              </h2>
              <p class="mt-1 text-xs text-muted-foreground">
                Tune gesture sensitivity, V-sign scrolling, and smoothing. Saved automatically to your browser.
              </p>
            </div>
            <button
              type="button"
              (click)="close()"
              aria-label="Close settings drawer"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-glass-border bg-secondary/60 text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6 6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

          <!-- Core Mode Switches -->
          <div class="space-y-3 border-t border-glass-border pt-4">
            <!-- Live Control Switch -->
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-medium text-foreground">Live control (Win32)</div>
                <div class="text-xs text-muted-foreground">
                  Move, snap, and scroll real Windows apps via local backend
                </div>
              </div>
              <button
                type="button"
                role="switch"
                [attr.aria-checked]="store.liveControl()"
                aria-label="Toggle Live control"
                (click)="store.toggleLiveControl()"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors"
                [ngClass]="
                  store.liveControl()
                    ? 'border-armed/60 bg-armed/30'
                    : 'border-glass-border bg-secondary'
                ">
                <span
                  class="inline-block h-4 w-4 transform rounded-full transition-transform"
                  [ngClass]="
                    store.liveControl()
                      ? 'translate-x-5 bg-armed'
                      : 'translate-x-1 bg-muted-foreground'
                  "></span>
              </button>
            </div>

            <!-- Sound Cues Switch -->
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-medium text-foreground">Sound cues</div>
                <div class="text-xs text-muted-foreground">
                  Subtle Web Audio tones on pinch, zone arm, snap, and scroll
                </div>
              </div>
              <button
                type="button"
                role="switch"
                [attr.aria-checked]="!store.muted()"
                aria-label="Toggle sound cues"
                (click)="store.toggleMute()"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors"
                [ngClass]="
                  !store.muted()
                    ? 'border-primary/60 bg-primary/25'
                    : 'border-glass-border bg-secondary'
                ">
                <span
                  class="inline-block h-4 w-4 transform rounded-full transition-transform"
                  [ngClass]="
                    !store.muted()
                      ? 'translate-x-5 bg-primary'
                      : 'translate-x-1 bg-muted-foreground'
                  "></span>
              </button>
            </div>
          </div>

          <!-- Section: Pinch & Snap Thresholds -->
          <div class="space-y-4 border-t border-glass-border pt-4">
            <h3 class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Pinch &amp; Edge Snap
            </h3>

            <!-- Pinch Enter Threshold -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-pinch-enter" class="text-sm font-medium text-foreground">
                  Pinch Enter Threshold
                </label>
                <span class="font-mono text-xs text-primary">
                  {{ s().pinchEnterThreshold | number:'1.2-2' }}
                </span>
              </div>
              <input
                id="s-pinch-enter"
                type="range"
                min="0.15"
                max="0.45"
                step="0.01"
                class="w-full accent-primary"
                [ngModel]="s().pinchEnterThreshold"
                (ngModelChange)="store.updateSetting('pinchEnterThreshold', +$event)" />
              <p class="text-[11px] text-muted-foreground">
                Thumb-to-index distance normalized by hand size. Higher = easier to trigger pinch.
              </p>
            </div>

            <!-- Pinch Exit Multiplier -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-pinch-exit" class="text-sm font-medium text-foreground">
                  Release Hysteresis Multiplier
                </label>
                <span class="font-mono text-xs text-primary">
                  {{ s().pinchExitMultiplier | number:'1.1-2' }}x
                </span>
              </div>
              <input
                id="s-pinch-exit"
                type="range"
                min="1.15"
                max="2.00"
                step="0.05"
                class="w-full accent-primary"
                [ngModel]="s().pinchExitMultiplier"
                (ngModelChange)="store.updateSetting('pinchExitMultiplier', +$event)" />
            </div>

            <!-- Edge Snap Zone Size -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-edge-zone" class="text-sm font-medium text-foreground">
                  Edge Snap Zone Width
                </label>
                <span class="font-mono text-xs text-primary">
                  {{ (s().edgeZoneSize * 100) | number:'1.0-0' }}%
                </span>
              </div>
              <input
                id="s-edge-zone"
                type="range"
                min="0.12"
                max="0.32"
                step="0.01"
                class="w-full accent-primary"
                [ngModel]="s().edgeZoneSize"
                (ngModelChange)="store.updateSetting('edgeZoneSize', +$event)" />
            </div>

            <!-- Zone Dwell Time -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-dwell" class="text-sm font-medium text-foreground">
                  Zone Arm Dwell Time
                </label>
                <span class="font-mono text-xs text-primary">{{ s().dwellTimeMs }} ms</span>
              </div>
              <input
                id="s-dwell"
                type="range"
                min="50"
                max="500"
                step="25"
                class="w-full accent-primary"
                [ngModel]="s().dwellTimeMs"
                (ngModelChange)="store.updateSetting('dwellTimeMs', +$event)" />
            </div>

            <!-- Snap Cooldown -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-cooldown" class="text-sm font-medium text-foreground">
                  Snap Cooldown
                </label>
                <span class="font-mono text-xs text-primary">{{ s().cooldownMs }} ms</span>
              </div>
              <input
                id="s-cooldown"
                type="range"
                min="250"
                max="1800"
                step="50"
                class="w-full accent-primary"
                [ngModel]="s().cooldownMs"
                (ngModelChange)="store.updateSetting('cooldownMs', +$event)" />
            </div>

            <!-- Left / Right Split Ratio -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-ratio" class="text-sm font-medium text-foreground">
                  Snap Split Ratio
                </label>
                <span class="font-mono text-xs text-primary">
                  {{ (s().snapRatio * 100) | number:'1.0-0' }}%
                </span>
              </div>
              <input
                id="s-ratio"
                type="range"
                min="0.30"
                max="0.70"
                step="0.05"
                class="w-full accent-primary"
                [ngModel]="s().snapRatio"
                (ngModelChange)="store.updateSetting('snapRatio', +$event)" />
            </div>
          </div>

          <!-- Section: V-Sign Scrolling -->
          <div class="space-y-4 border-t border-glass-border pt-4">
            <div class="flex items-center justify-between">
              <h3 class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                V-Sign Scrolling
              </h3>
              <button
                type="button"
                role="switch"
                [attr.aria-checked]="s().scrollEnabled"
                aria-label="Toggle V-Sign scrolling"
                (click)="store.updateSetting('scrollEnabled', !s().scrollEnabled)"
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors"
                [ngClass]="
                  s().scrollEnabled
                    ? 'border-primary/60 bg-primary/25'
                    : 'border-glass-border bg-secondary'
                ">
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full transition-transform"
                  [ngClass]="
                    s().scrollEnabled
                      ? 'translate-x-4 bg-primary'
                      : 'translate-x-0.5 bg-muted-foreground'
                  "></span>
              </button>
            </div>

            <!-- Scroll Direction (Natural / Inverted) -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-foreground">Scroll Direction</span>
                <span class="font-mono text-xs text-primary">
                  {{ s().invertScroll ? 'Inverted' : 'Natural' }}
                </span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  (click)="store.updateSetting('invertScroll', false)"
                  class="rounded-xl border px-3 py-2 text-xs font-medium transition"
                  [ngClass]="
                    !s().invertScroll
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-glass-border bg-secondary/40 text-muted-foreground hover:border-primary/30'
                  ">
                  Natural (Up = Up)
                </button>
                <button
                  type="button"
                  (click)="store.updateSetting('invertScroll', true)"
                  class="rounded-xl border px-3 py-2 text-xs font-medium transition"
                  [ngClass]="
                    s().invertScroll
                      ? 'border-primary/60 bg-primary/15 text-primary'
                      : 'border-glass-border bg-secondary/40 text-muted-foreground hover:border-primary/30'
                  ">
                  Inverted
                </button>
              </div>
            </div>

            <!-- Scroll Gain -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-scroll-gain" class="text-sm font-medium text-foreground">
                  Scroll Gain
                </label>
                <span class="font-mono text-xs text-primary">{{ s().scrollGain }}</span>
              </div>
              <input
                id="s-scroll-gain"
                type="range"
                min="1000"
                max="8000"
                step="250"
                class="w-full accent-primary"
                [ngModel]="s().scrollGain"
                (ngModelChange)="store.updateSetting('scrollGain', +$event)" />
              <p class="text-[11px] text-muted-foreground">
                Wheel units per normalized frame height (default 4000).
              </p>
            </div>

            <!-- Scroll Deadzone -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-scroll-deadzone" class="text-sm font-medium text-foreground">
                  Scroll Deadzone
                </label>
                <span class="font-mono text-xs text-primary">
                  {{ s().scrollDeadzone | number:'1.3-4' }}
                </span>
              </div>
              <input
                id="s-scroll-deadzone"
                type="range"
                min="0.0005"
                max="0.010"
                step="0.0005"
                class="w-full accent-primary"
                [ngModel]="s().scrollDeadzone"
                (ngModelChange)="store.updateSetting('scrollDeadzone', +$event)" />
            </div>

            <!-- V-Spread Min -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <label for="s-vspread" class="text-sm font-medium text-foreground">
                  Minimum V-Finger Spread
                </label>
                <span class="font-mono text-xs text-primary">
                  {{ s().vSpreadMin | number:'1.2-2' }}
                </span>
              </div>
              <input
                id="s-vspread"
                type="range"
                min="0.20"
                max="0.65"
                step="0.01"
                class="w-full accent-primary"
                [ngModel]="s().vSpreadMin"
                (ngModelChange)="store.updateSetting('vSpreadMin', +$event)" />
            </div>

            <!-- Scroll Enter / Exit Dwell -->
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label for="s-scroll-enter" class="text-xs font-medium text-foreground">
                    Enter Hold
                  </label>
                  <span class="font-mono text-[11px] text-primary">{{ s().scrollEnterMs }}ms</span>
                </div>
                <input
                  id="s-scroll-enter"
                  type="range"
                  min="40"
                  max="350"
                  step="10"
                  class="w-full accent-primary"
                  [ngModel]="s().scrollEnterMs"
                  (ngModelChange)="store.updateSetting('scrollEnterMs', +$event)" />
              </div>

              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label for="s-scroll-exit" class="text-xs font-medium text-foreground">
                    Exit Hold
                  </label>
                  <span class="font-mono text-[11px] text-primary">{{ s().scrollExitMs }}ms</span>
                </div>
                <input
                  id="s-scroll-exit"
                  type="range"
                  min="50"
                  max="400"
                  step="10"
                  class="w-full accent-primary"
                  [ngModel]="s().scrollExitMs"
                  (ngModelChange)="store.updateSetting('scrollExitMs', +$event)" />
              </div>
            </div>
          </div>

          <!-- Section: Wave Scenes -->
          <div class="space-y-3 border-t border-glass-border pt-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-medium text-foreground">Wave Scenes</div>
                <div class="text-xs text-muted-foreground">
                  Save window layouts & restore via 3 or 4-finger hand poses
                </div>
              </div>
              <button
                type="button"
                role="switch"
                [attr.aria-checked]="s().scenesEnabled"
                aria-label="Toggle Wave Scenes"
                (click)="store.updateSetting('scenesEnabled', !s().scenesEnabled)"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors"
                [ngClass]="
                  s().scenesEnabled
                    ? 'border-primary/60 bg-primary/30'
                    : 'border-glass-border bg-secondary'
                ">
                <span
                  class="inline-block h-4 w-4 transform rounded-full transition-transform"
                  [ngClass]="
                    s().scenesEnabled
                      ? 'translate-x-5 bg-primary'
                      : 'translate-x-1 bg-muted-foreground'
                  "></span>
              </button>
            </div>

            <div *ngIf="s().scenesEnabled" class="space-y-3 pt-1">
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label for="s-scene-hold" class="text-xs font-medium text-foreground">
                    Pose Hold Duration
                  </label>
                  <span class="font-mono text-[11px] text-primary">{{ s().sceneHoldMs }}ms</span>
                </div>
                <input
                  id="s-scene-hold"
                  type="range"
                  min="300"
                  max="1200"
                  step="50"
                  class="w-full accent-primary"
                  [ngModel]="s().sceneHoldMs"
                  (ngModelChange)="store.updateSetting('sceneHoldMs', +$event)" />
              </div>

              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label for="s-scene-cooldown" class="text-xs font-medium text-foreground">
                    Gesture Cooldown
                  </label>
                  <span class="font-mono text-[11px] text-primary">{{ s().sceneCooldownMs }}ms</span>
                </div>
                <input
                  id="s-scene-cooldown"
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  class="w-full accent-primary"
                  [ngModel]="s().sceneCooldownMs"
                  (ngModelChange)="store.updateSetting('sceneCooldownMs', +$event)" />
              </div>

              <button
                type="button"
                (click)="store.toggleScenesDrawer(true); close()"
                class="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 transition cursor-pointer">
                <span>Manage Saved Scenes ({{ store.scenes().length }})</span>
              </button>
            </div>
          </div>

          <!-- Section: Cursor Smoothing Filter -->
          <div class="space-y-3 border-t border-glass-border pt-4">
            <h3 class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Smoothing Filter
            </h3>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                (click)="setFilter('lerp')"
                class="rounded-xl border p-3 text-left transition"
                [ngClass]="
                  s().filterType === 'lerp'
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-glass-border bg-secondary/40 hover:border-primary/30'
                ">
                <div class="text-sm font-medium text-foreground">Lerp</div>
                <div class="text-[11px] text-muted-foreground">Snappy linear interpolation</div>
              </button>
              <button
                type="button"
                (click)="setFilter('oneEuro')"
                class="rounded-xl border p-3 text-left transition"
                [ngClass]="
                  s().filterType === 'oneEuro'
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-glass-border bg-secondary/40 hover:border-primary/30'
                ">
                <div class="text-sm font-medium text-foreground">One Euro (1€)</div>
                <div class="text-[11px] text-muted-foreground">Adaptive velocity filter</div>
              </button>
            </div>

            <div class="space-y-2 pt-1">
              <div class="flex items-center justify-between">
                <label for="s-lerp" class="text-sm font-medium text-foreground">
                  Smoothing Factor (Alpha)
                </label>
                <span class="font-mono text-xs text-primary">
                  {{ s().lerpAlpha | number:'1.2-2' }}
                </span>
              </div>
              <input
                id="s-lerp"
                type="range"
                min="0.10"
                max="0.90"
                step="0.05"
                class="w-full accent-primary"
                [ngModel]="s().lerpAlpha"
                (ngModelChange)="store.updateSetting('lerpAlpha', +$event)" />
            </div>
          </div>

          <!-- Section: Extra Spatial Features -->
          <div class="space-y-2 border-t border-glass-border pt-4">
            <h3 class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Spatial Extensions
            </h3>
            <div class="flex flex-wrap gap-2 pt-1">
              <label
                class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-glass-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground">
                <input
                  type="checkbox"
                  class="accent-primary"
                  [ngModel]="s().enableCorners"
                  (ngModelChange)="store.updateSetting('enableCorners', !!$event)" />
                <span>4-Corner Snaps</span>
              </label>
              <label
                class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-glass-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground">
                <input
                  type="checkbox"
                  class="accent-primary"
                  [ngModel]="s().enableLiveDrag"
                  (ngModelChange)="store.updateSetting('enableLiveDrag', !!$event)" />
                <span>Live Window Drag</span>
              </label>
              <label
                class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-glass-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground">
                <input
                  type="checkbox"
                  class="accent-primary"
                  [ngModel]="s().enableThrowGesture"
                  (ngModelChange)="store.updateSetting('enableThrowGesture', !!$event)" />
                <span>Throw to Next Monitor</span>
              </label>
            </div>
          </div>

          <!-- Section: Action Log -->
          <div class="space-y-2 border-t border-glass-border pt-4">
            <div class="flex items-center justify-between">
              <h3 class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                Recent Action Log
              </h3>
              <button
                *ngIf="store.actionLog().length > 0"
                type="button"
                (click)="store.clearActionLog()"
                class="text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Clear
              </button>
            </div>
            <div
              *ngIf="store.actionLog().length === 0"
              class="rounded-xl border border-glass-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              No actions recorded yet. Perform a gesture to see events here.
            </div>
            <div
              *ngIf="store.actionLog().length > 0"
              class="max-h-40 space-y-1.5 overflow-y-auto pr-1">
              <div
                *ngFor="let item of store.actionLog()"
                class="flex items-center justify-between gap-2 rounded-lg border border-glass-border bg-secondary/40 px-2.5 py-1.5 text-xs">
                <div class="min-w-0 flex-1 truncate">
                  <span class="font-medium text-foreground">{{ item.label }}</span>
                  <span class="ml-1.5 text-muted-foreground">· {{ item.detail }}</span>
                </div>
                <div class="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                  <span
                    class="rounded px-1.5 py-0.5"
                    [ngClass]="
                      item.live
                        ? 'bg-armed/20 text-armed'
                        : 'bg-secondary text-muted-foreground'
                    ">
                    {{ item.live ? 'LIVE' : 'PRACTICE' }}
                  </span>
                  <span class="text-muted-foreground">{{ item.timestamp }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Sheet Footer -->
        <div class="mt-6 flex items-center justify-between border-t border-glass-border pt-4">
          <button
            type="button"
            (click)="store.resetSettingsToDefaults()"
            class="inline-flex items-center gap-1.5 rounded-lg border border-glass-border bg-secondary/50 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3 3v5h5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Reset to defaults
          </button>
          <button
            type="button"
            (click)="close()"
            class="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90">
            Done
          </button>
        </div>
      </aside>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPanelComponent {
  readonly store = inject(WaveViewModelStore);
  readonly s = this.store.settings;

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.store.settingsOpen()) {
      this.close();
    }
  }

  setFilter(type: FilterType): void {
    this.store.setFilterType(type);
  }

  close(): void {
    this.store.toggleSettingsDrawer(false);
  }
}
