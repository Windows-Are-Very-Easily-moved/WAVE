import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WaveViewModelStore } from '../../core/services/wave-view-model.store';
import {
  OpenWindowCandidate,
  SCENE_PLACEMENT_PRESETS,
  ScenePlacementPresetId,
  SceneSummary,
  SceneWindowState,
  SelectedSceneWindowInput,
  WindowFractionalRect
} from '../../core/models/scene.model';

export interface ConfigurableSceneAppItem {
  key: string;
  handle: number | null;
  processName: string;
  className: string;
  title: string;
  executablePath: string | null;
  monitorDeviceName: string;
  originalRect: WindowFractionalRect;
  originalState: SceneWindowState;
  selected: boolean;
  presetId: ScenePlacementPresetId;
  targetRect: WindowFractionalRect;
  targetState: SceneWindowState;
}

@Component({
  selector: 'app-scenes-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- SCENES DRAWER MODAL -->
    <div
      *ngIf="store.scenesOpen()"
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenes-panel-title">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-background/80 backdrop-blur-md"
        (click)="store.toggleScenesDrawer(false)"
        aria-hidden="true"></div>

      <!-- Drawer Panel Container -->
      <div
        class="relative z-10 flex h-[90vh] max-h-[820px] w-full max-w-4xl flex-col rounded-3xl border border-glass-border glass-strong shadow-2xl overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-glass-border p-5 flex-wrap gap-3">
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10 glow-gold">
              <svg viewBox="0 0 24 24" class="h-5 w-5 text-primary" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" />
                <path d="M3 9h18M9 21V9" stroke-linecap="round" />
              </svg>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 id="scenes-panel-title" class="font-display text-lg font-bold text-gold-gradient">
                  Wave Scenes
                </h2>
                <span class="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                  {{ store.scenes().length }}/20
                </span>
              </div>
              <p class="text-xs text-muted-foreground">
                Choose which apps to open, decide where they go on screen, and launch them with a 3 or 4 finger gesture.
              </p>
            </div>
          </div>

          <!-- Header Actions -->
          <div class="flex items-center gap-2 flex-wrap">
            <!-- Undo Button -->
            <button
              type="button"
              (click)="store.undoLastScene()"
              [disabled]="!store.undoAvailable()"
              class="inline-flex items-center gap-1.5 rounded-xl border border-glass-border px-3 py-1.5 text-xs font-mono transition cursor-pointer"
              [ngClass]="
                store.undoAvailable()
                  ? 'bg-secondary/80 text-foreground hover:border-primary/50'
                  : 'bg-secondary/30 text-muted-foreground/50 cursor-not-allowed opacity-60'
              "
              title="Undo last scene restoration (Hotkey: U)">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 7v6h6" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span>Undo</span>
              <kbd class="ml-1 rounded bg-secondary px-1 py-0.5 text-[9px] text-muted-foreground">U</kbd>
            </button>

            <!-- Create New Scene Button -->
            <button
              type="button"
              (click)="openSaveModal()"
              [disabled]="!store.settings().scenesEnabled"
              class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition cursor-pointer">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" stroke-linecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round" />
              </svg>
              <span>New Custom Scene</span>
            </button>

            <!-- Close Drawer -->
            <button
              type="button"
              (click)="store.toggleScenesDrawer(false)"
              aria-label="Close Scenes panel"
              class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-glass-border bg-secondary/60 text-muted-foreground hover:text-foreground cursor-pointer transition">
              ✕
            </button>
          </div>
        </div>

        <!-- Body Area -->
        <div class="flex-1 overflow-y-auto p-5 space-y-4">
          <!-- Disabled Notice -->
          <div
            *ngIf="!store.settings().scenesEnabled"
            class="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive flex items-center gap-3">
            <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <div>
              <span class="font-semibold">Wave Scenes is disabled.</span>
              <p class="text-muted-foreground mt-0.5">Enable it in the Settings drawer (press S) to save and restore layouts.</p>
            </div>
          </div>

          <!-- Empty State -->
          <div
            *ngIf="store.settings().scenesEnabled && store.scenes().length === 0 && !store.scenesLoading()"
            class="flex flex-col items-center justify-center rounded-3xl border border-dashed border-glass-border p-12 text-center space-y-3">
            <div class="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
              <svg viewBox="0 0 24 24" class="h-7 w-7 text-primary" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3 class="font-display text-base font-semibold text-foreground">
              No saved scenes yet
            </h3>
            <p class="max-w-md text-xs text-muted-foreground leading-relaxed">
              Click <strong class="text-foreground">"New Custom Scene"</strong> to pick which apps you want, choose where each app should be placed (Left Half, Right Half, Corners, Full Screen, etc.), and assign a 3-finger or 4-finger gesture to auto-launch and snap them into place anytime!
            </p>
            <button
              type="button"
              (click)="openSaveModal()"
              class="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-primary/20 border border-primary/40 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/30 transition cursor-pointer">
              Create your first scene
            </button>
          </div>

          <!-- Loading State -->
          <div
            *ngIf="store.scenesLoading()"
            class="flex items-center justify-center p-12 text-muted-foreground font-mono text-xs gap-2">
            <svg viewBox="0 0 24 24" class="h-4 w-4 animate-spin text-primary" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" stroke-linecap="round" />
            </svg>
            Loading scenes…
          </div>

          <!-- Scenes Grid -->
          <div
            *ngIf="store.scenes().length > 0"
            class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              *ngFor="let scene of store.scenes()"
              class="group relative flex flex-col justify-between rounded-2xl border border-glass-border bg-secondary/40 p-4 transition hover:border-primary/50 hover:bg-secondary/60">
              <!-- Card Header -->
              <div>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h4 class="font-display text-sm font-semibold text-foreground truncate">
                      {{ scene.name }}
                    </h4>
                    <span class="font-mono text-[11px] text-muted-foreground">
                      {{ scene.windowCount }} {{ scene.windowCount === 1 ? 'app' : 'apps' }} · Auto-launches if closed
                    </span>
                  </div>

                  <!-- Gesture Badge -->
                  <div class="shrink-0">
                    <span
                      *ngIf="scene.gestureFingers"
                      class="inline-flex items-center gap-1 rounded-full border border-armed/40 bg-armed/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-armed">
                      <span>🖐️ {{ scene.gestureFingers }} fingers</span>
                    </span>
                    <span
                      *ngIf="!scene.gestureFingers"
                      class="rounded-full border border-glass-border bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      Button only
                    </span>
                  </div>
                </div>

                <!-- Schematic Preview Box -->
                <div class="mt-3 relative h-32 w-full rounded-xl border border-glass-border/70 bg-void/60 p-2 overflow-hidden flex items-center justify-center">
                  <!-- Monitor Bezel Frame -->
                  <div class="relative h-full w-full rounded-lg border border-primary/25 bg-background/40 overflow-hidden">
                    <!-- Monitor screen line grid watermark -->
                    <div class="absolute inset-0 opacity-10 pointer-events-none grid grid-cols-4 grid-rows-2 gap-0.5 p-1">
                      <div *ngFor="let _ of [1,2,3,4,5,6,7,8]" class="border border-foreground/30"></div>
                    </div>

                    <!-- Window Rectangles inside Schematic -->
                    <div
                      *ngFor="let win of scene.windows; let i = index"
                      class="absolute rounded transition-all shadow-sm border text-[9px] font-mono flex flex-col items-center justify-center overflow-hidden font-medium select-none px-1 text-center"
                      [style.left.%]="win.rect.x * 100"
                      [style.top.%]="win.rect.y * 100"
                      [style.width.%]="win.rect.w * 100"
                      [style.height.%]="win.rect.h * 100"
                      [ngClass]="getWindowColorClass(i)">
                      <span class="truncate max-w-full font-semibold">{{ win.processName }}</span>
                      <span *ngIf="win.titleHint && win.titleHint !== win.processName" class="truncate max-w-full text-[8px] opacity-75">
                        {{ win.titleHint }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Card Action Bar -->
              <div class="mt-4 flex items-center justify-between border-t border-glass-border/50 pt-3">
                <div class="flex items-center gap-1">
                  <!-- Edit Button -->
                  <button
                    type="button"
                    (click)="openEditModal(scene)"
                    class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-secondary transition cursor-pointer"
                    title="Customize apps, positions, or gesture">
                    <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9" stroke-linecap="round" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    Customize
                  </button>

                  <!-- Delete Button -->
                  <button
                    type="button"
                    (click)="store.deleteScene(scene.id)"
                    class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-mono text-destructive/80 hover:text-destructive hover:bg-destructive/10 transition cursor-pointer"
                    title="Delete scene">
                    <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6" stroke-linecap="round" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    Delete
                  </button>
                </div>

                <!-- Launch & Apply Button -->
                <button
                  type="button"
                  (click)="store.applyScene(scene)"
                  class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 font-display text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition cursor-pointer">
                  <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Open &amp; Arrange</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Note -->
        <div class="flex items-center justify-between border-t border-glass-border px-5 py-3 text-[11px] font-mono text-muted-foreground flex-wrap gap-2">
          <span>Closed apps in a scene will auto-launch when triggered in Live Mode.</span>
          <span [ngClass]="store.liveControl() ? 'text-armed font-semibold' : 'text-primary'">
            {{ store.liveControl() ? '● Live Control ON (Moves & launches real apps)' : '○ Practice Mode (Turn on Live Control in header to move real apps)' }}
          </span>
        </div>
      </div>
    </div>

    <!-- PERSONALIZED SCENE BUILDER MODAL (CREATE / EDIT) -->
    <div
      *ngIf="isModalOpen()"
      class="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scene-dialog-title">
      <div
        class="fixed inset-0 bg-background/85 backdrop-blur-md"
        (click)="closeModal()"
        aria-hidden="true"></div>

      <div class="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col rounded-3xl border border-glass-border glass-strong shadow-2xl overflow-hidden">
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-glass-border px-6 py-4">
          <div>
            <h3 id="scene-dialog-title" class="font-display text-lg font-bold text-gold-gradient">
              {{ editingSceneId() ? 'Customize Scene' : 'Build Custom Scene' }}
            </h3>
            <p class="text-xs text-muted-foreground">
              Pick the apps you want, choose where each one goes on your screen, and assign a hand gesture.
            </p>
          </div>
          <button
            type="button"
            (click)="closeModal()"
            class="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-glass-border bg-secondary/60 text-muted-foreground hover:text-foreground cursor-pointer">
            ✕
          </button>
        </div>

        <!-- Scrollable Modal Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5">
          <!-- Row 1: Scene Name & Gesture Shortcut -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <!-- Scene Name Input -->
            <div class="space-y-1.5">
              <label for="scene-name-input" class="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
                1. Scene Name
              </label>
              <input
                id="scene-name-input"
                type="text"
                maxlength="60"
                [(ngModel)]="modalName"
                placeholder="e.g. Coding Workspace, Study Split"
                class="w-full rounded-xl border border-glass-border bg-secondary/60 px-3.5 py-2.5 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none" />
            </div>

            <!-- Gesture Fingers Selector -->
            <div class="space-y-1.5">
              <label class="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
                2. Hand Gesture Trigger
              </label>
              <div class="grid grid-cols-3 gap-1.5">
                <!-- Option 3 Fingers -->
                <button
                  type="button"
                  (click)="!isGestureTaken(3) && (modalGesture = 3)"
                  [disabled]="isGestureTaken(3)"
                  class="flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition cursor-pointer"
                  [ngClass]="{
                    'border-armed bg-armed/15 text-armed font-semibold': modalGesture === 3,
                    'border-glass-border bg-secondary/40 text-muted-foreground hover:border-primary/40': modalGesture !== 3 && !isGestureTaken(3),
                    'border-glass-border/30 bg-secondary/20 text-muted-foreground/40 cursor-not-allowed opacity-50': isGestureTaken(3)
                  }">
                  <span class="text-xs">🖐️ 3 Fingers</span>
                  <span class="text-[9px] truncate max-w-full opacity-80">
                    {{ isGestureTaken(3) ? 'Used' : 'Index+Mid+Ring' }}
                  </span>
                </button>

                <!-- Option 4 Fingers -->
                <button
                  type="button"
                  (click)="!isGestureTaken(4) && (modalGesture = 4)"
                  [disabled]="isGestureTaken(4)"
                  class="flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition cursor-pointer"
                  [ngClass]="{
                    'border-armed bg-armed/15 text-armed font-semibold': modalGesture === 4,
                    'border-glass-border bg-secondary/40 text-muted-foreground hover:border-primary/40': modalGesture !== 4 && !isGestureTaken(4),
                    'border-glass-border/30 bg-secondary/20 text-muted-foreground/40 cursor-not-allowed opacity-50': isGestureTaken(4)
                  }">
                  <span class="text-xs">🖐️ 4 Fingers</span>
                  <span class="text-[9px] truncate max-w-full opacity-80">
                    {{ isGestureTaken(4) ? 'Used' : 'Thumb tucked' }}
                  </span>
                </button>

                <!-- Option None -->
                <button
                  type="button"
                  (click)="modalGesture = null"
                  class="flex flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-center transition cursor-pointer"
                  [ngClass]="modalGesture === null ? 'border-primary bg-primary/15 text-primary font-semibold' : 'border-glass-border bg-secondary/40 text-muted-foreground hover:border-primary/40'">
                  <span class="text-xs">🔘 None</span>
                  <span class="text-[9px] opacity-80">Button only</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Row 2: Live Interactive Screen Layout Preview -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
                Live Screen Preview ({{ selectedAppCount() }} {{ selectedAppCount() === 1 ? 'app' : 'apps' }} selected)
              </span>
              <span class="font-mono text-[10px] text-primary">
                Updates live as you pick positions below
              </span>
            </div>
            <div class="relative h-36 w-full rounded-2xl border border-glass-border bg-void/80 p-2.5 overflow-hidden flex items-center justify-center">
              <div class="relative h-full w-full rounded-xl border border-primary/30 bg-background/50 overflow-hidden">
                <!-- Subtle 2x2 Quadrant Grid Lines -->
                <div class="absolute inset-0 pointer-events-none grid grid-cols-2 grid-rows-2">
                  <div class="border-r border-b border-foreground/10"></div>
                  <div class="border-b border-foreground/10"></div>
                  <div class="border-r border-foreground/10"></div>
                  <div></div>
                </div>

                <!-- Empty Preview Prompt -->
                <div
                  *ngIf="selectedApps().length === 0"
                  class="absolute inset-0 flex items-center justify-center text-xs font-mono text-muted-foreground/60">
                  Check one or more apps below to arrange them on screen
                </div>

                <!-- Selected App Rectangles -->
                <div
                  *ngFor="let item of selectedApps(); let i = index"
                  class="absolute rounded-lg transition-all duration-200 shadow-md border flex flex-col items-center justify-center overflow-hidden p-1 text-center select-none"
                  [style.left.%]="item.targetRect.x * 100"
                  [style.top.%]="item.targetRect.y * 100"
                  [style.width.%]="item.targetRect.w * 100"
                  [style.height.%]="item.targetRect.h * 100"
                  [ngClass]="getWindowColorClass(i)">
                  <span class="font-display text-[11px] font-bold truncate max-w-full">
                    {{ item.processName }}
                  </span>
                  <span class="font-mono text-[9px] opacity-85 truncate max-w-full">
                    {{ getPresetShortLabel(item.presetId) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Row 3: Select Apps & Decide Their Screen Position -->
          <div class="space-y-2.5">
            <div class="flex items-center justify-between flex-wrap gap-2">
              <label class="font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
                3. Select Apps &amp; Choose Screen Position
              </label>

              <div class="flex items-center gap-1.5 flex-wrap">
                <!-- Quick-add common Windows apps even if not currently open -->
                <button
                  type="button"
                  (click)="addPresetApp('Notepad', 'notepad.exe', 'Notepad')"
                  class="rounded-lg border border-glass-border bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition cursor-pointer"
                  title="Add Notepad to this scene (will auto-launch if closed)">
                  + Notepad
                </button>
                <button
                  type="button"
                  (click)="addPresetApp('CalculatorApp', 'calc.exe', 'Calculator')"
                  class="rounded-lg border border-glass-border bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition cursor-pointer"
                  title="Add Calculator to this scene (will auto-launch if closed)">
                  + Calculator
                </button>
                <button
                  type="button"
                  (click)="addPresetApp('explorer', 'explorer.exe', 'File Explorer')"
                  class="rounded-lg border border-glass-border bg-secondary/50 px-2 py-1 font-mono text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition cursor-pointer"
                  title="Add File Explorer to this scene (will auto-launch if closed)">
                  + Explorer
                </button>
                <button
                  type="button"
                  (click)="refreshOpenApps()"
                  class="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary hover:bg-primary/20 transition cursor-pointer"
                  title="Re-scan currently open desktop windows">
                  ↻ Refresh Open Apps
                </button>
              </div>
            </div>

            <!-- App List -->
            <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
              <div
                *ngIf="configurableApps().length === 0"
                class="rounded-2xl border border-dashed border-glass-border p-6 text-center text-xs text-muted-foreground">
                No open windows found. Open any app on your desktop and click <strong>Refresh Open Apps</strong>, or use the quick-add buttons above.
              </div>

              <div
                *ngFor="let app of configurableApps(); let idx = index"
                class="rounded-2xl border p-3 transition"
                [ngClass]="
                  app.selected
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-glass-border bg-secondary/30 opacity-75 hover:opacity-100'
                ">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <!-- Left: Checkbox & App Info -->
                  <label class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      [checked]="app.selected"
                      (change)="toggleAppSelection(idx)"
                      class="h-4 w-4 rounded border-glass-border accent-amber-400 cursor-pointer shrink-0" />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="font-display text-xs font-bold text-foreground truncate">
                          {{ app.processName }}
                        </span>
                        <span
                          *ngIf="app.executablePath"
                          class="rounded border border-armed/30 bg-armed/10 px-1.5 py-0.2 font-mono text-[9px] text-armed shrink-0">
                          Auto-Launch Ready
                        </span>
                      </div>
                      <div class="text-[11px] text-muted-foreground truncate">
                        {{ app.title }}
                      </div>
                    </div>
                  </label>

                  <!-- Right: Screen Placement Selector (shown when selected) -->
                  <div *ngIf="app.selected" class="flex items-center gap-1.5 shrink-0">
                    <!-- Quick Left / Right / Max buttons -->
                    <button
                      type="button"
                      (click)="setAppPreset(idx, 'left')"
                      class="rounded-lg border px-2 py-1 font-mono text-[10px] transition cursor-pointer"
                      [ngClass]="
                        app.presetId === 'left'
                          ? 'border-primary bg-primary text-primary-foreground font-semibold'
                          : 'border-glass-border bg-secondary/60 text-muted-foreground hover:text-foreground'
                      "
                      title="Place on Left Half of screen">
                      ◧ Left
                    </button>
                    <button
                      type="button"
                      (click)="setAppPreset(idx, 'right')"
                      class="rounded-lg border px-2 py-1 font-mono text-[10px] transition cursor-pointer"
                      [ngClass]="
                        app.presetId === 'right'
                          ? 'border-primary bg-primary text-primary-foreground font-semibold'
                          : 'border-glass-border bg-secondary/60 text-muted-foreground hover:text-foreground'
                      "
                      title="Place on Right Half of screen">
                      ◨ Right
                    </button>
                    <button
                      type="button"
                      (click)="setAppPreset(idx, 'maximized')"
                      class="rounded-lg border px-2 py-1 font-mono text-[10px] transition cursor-pointer"
                      [ngClass]="
                        app.presetId === 'maximized'
                          ? 'border-primary bg-primary text-primary-foreground font-semibold'
                          : 'border-glass-border bg-secondary/60 text-muted-foreground hover:text-foreground'
                      "
                      title="Maximize full screen">
                      ⬜ Full
                    </button>

                    <!-- Full Dropdown for Corners, Halves, Center, Current Spot -->
                    <select
                      [ngModel]="app.presetId"
                      (ngModelChange)="setAppPreset(idx, $event)"
                      aria-label="Screen placement zone"
                      class="rounded-xl border border-glass-border bg-secondary px-2.5 py-1 font-mono text-[11px] text-foreground focus:border-primary/60 focus:outline-none cursor-pointer">
                      <option *ngFor="let preset of placementPresets" [value]="preset.id">
                        {{ preset.label }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer Actions -->
        <div class="flex items-center justify-between border-t border-glass-border px-6 py-4 bg-secondary/20">
          <div class="text-[11px] font-mono text-muted-foreground">
            {{ selectedAppCount() === 0 ? 'Select at least 1 app to save' : selectedAppCount() + ' app(s) will be saved to this scene' }}
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              (click)="closeModal()"
              class="rounded-xl border border-glass-border bg-secondary/50 px-4 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition cursor-pointer">
              Cancel
            </button>
            <button
              type="button"
              (click)="saveModal()"
              [disabled]="selectedAppCount() === 0"
              class="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              {{ editingSceneId() ? 'Save Scene Changes' : 'Save Scene' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScenesPanelComponent {
  readonly store = inject(WaveViewModelStore);

  readonly isModalOpen = signal<boolean>(false);
  readonly editingSceneId = signal<string | null>(null);
  readonly configurableApps = signal<ConfigurableSceneAppItem[]>([]);

  readonly selectedApps = computed(() =>
    this.configurableApps().filter((a) => a.selected)
  );
  readonly selectedAppCount = computed(() => this.selectedApps().length);

  readonly placementPresets = SCENE_PLACEMENT_PRESETS;

  modalName = '';
  modalGesture: 3 | 4 | null = null;

  async openSaveModal(): Promise<void> {
    this.editingSceneId.set(null);
    this.modalName = `Workspace ${this.store.scenes().length + 1}`;
    if (!this.isGestureTaken(3)) {
      this.modalGesture = 3;
    } else if (!this.isGestureTaken(4)) {
      this.modalGesture = 4;
    } else {
      this.modalGesture = null;
    }

    this.isModalOpen.set(true);
    await this.store.loadOpenWindows();
    this.initializeAppsFromOpenCandidates(this.store.openWindowCandidates());
  }

  async openEditModal(scene: SceneSummary): Promise<void> {
    this.editingSceneId.set(scene.id);
    this.modalName = scene.name;
    this.modalGesture = scene.gestureFingers;
    this.isModalOpen.set(true);

    await this.store.loadOpenWindows();
    this.initializeAppsForEdit(scene, this.store.openWindowCandidates());
  }

  async refreshOpenApps(): Promise<void> {
    await this.store.loadOpenWindows();
    const currentList = this.configurableApps();
    const freshOpen = this.store.openWindowCandidates();

    const merged = [...currentList];
    for (const cand of freshOpen) {
      const exists = merged.some(
        (m) =>
          (m.handle && m.handle === cand.handle) ||
          (m.processName.toLowerCase() === cand.processName.toLowerCase() &&
            m.title.toLowerCase() === cand.title.toLowerCase())
      );
      if (!exists) {
        merged.push({
          key: `win-${cand.handle}-${ merged.length }`,
          handle: cand.handle,
          processName: cand.processName,
          className: cand.className,
          title: cand.title,
          executablePath: cand.executablePath ?? null,
          monitorDeviceName: cand.monitorDeviceName,
          originalRect: { ...cand.rect },
          originalState: cand.state,
          selected: false,
          presetId: 'current',
          targetRect: { ...cand.rect },
          targetState: cand.state
        });
      }
    }
    this.configurableApps.set(merged);
  }

  addPresetApp(processName: string, executablePath: string, friendlyTitle: string): void {
    const current = this.configurableApps();
    const selectedCount = current.filter((a) => a.selected).length;
    // Default first added app to Left Half, second to Right Half
    const defaultPreset: ScenePlacementPresetId =
      selectedCount === 0 ? 'left' : selectedCount === 1 ? 'right' : 'topLeft';
    const presetMeta = SCENE_PLACEMENT_PRESETS.find((p) => p.id === defaultPreset)!;

    const newItem: ConfigurableSceneAppItem = {
      key: `preset-${processName}-${Date.now()}`,
      handle: null,
      processName,
      className: '',
      title: friendlyTitle,
      executablePath,
      monitorDeviceName: '\\\\.\\DISPLAY1',
      originalRect: { ...(presetMeta.rect ?? { x: 0, y: 0, w: 0.5, h: 1 }) },
      originalState: 'normal',
      selected: true,
      presetId: defaultPreset,
      targetRect: { ...(presetMeta.rect ?? { x: 0, y: 0, w: 0.5, h: 1 }) },
      targetState: presetMeta.state ?? 'normal'
    };

    this.configurableApps.set([newItem, ...current]);
  }

  toggleAppSelection(index: number): void {
    this.configurableApps.update((list) =>
      list.map((item, idx) =>
        idx === index ? { ...item, selected: !item.selected } : item
      )
    );
  }

  setAppPreset(index: number, presetId: ScenePlacementPresetId): void {
    const preset = SCENE_PLACEMENT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    this.configurableApps.update((list) =>
      list.map((item, idx) => {
        if (idx !== index) return item;
        const nextRect =
          presetId === 'current' || !preset.rect
            ? { ...item.originalRect }
            : { ...preset.rect };
        const nextState: SceneWindowState =
          presetId === 'current'
            ? item.originalState
            : preset.state ?? 'normal';

        return {
          ...item,
          selected: true,
          presetId,
          targetRect: nextRect,
          targetState: nextState
        };
      })
    );
  }

  getPresetShortLabel(presetId: ScenePlacementPresetId): string {
    return (
      SCENE_PLACEMENT_PRESETS.find((p) => p.id === presetId)?.shortLabel ??
      'Custom'
    );
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingSceneId.set(null);
  }

  async saveModal(): Promise<void> {
    const name = this.modalName.trim() || 'Untitled Scene';
    const gesture = this.modalGesture;

    const selectedWindows: SelectedSceneWindowInput[] = this.selectedApps().map(
      (item) => ({
        handle: item.handle,
        processName: item.processName,
        className: item.className,
        titleHint: item.title,
        executablePath: item.executablePath,
        monitorDeviceName: item.monitorDeviceName,
        rect: item.targetRect,
        state: item.targetState
      })
    );

    if (this.editingSceneId()) {
      await this.store.updateScene(
        this.editingSceneId()!,
        name,
        gesture,
        selectedWindows
      );
    } else {
      await this.store.captureCurrentScene(name, gesture, selectedWindows);
    }

    this.closeModal();
  }

  isGestureTaken(fingers: 3 | 4): boolean {
    const editId = this.editingSceneId();
    return this.store
      .scenes()
      .some((s) => s.gestureFingers === fingers && s.id !== editId);
  }

  getGestureTakenName(fingers: 3 | 4): string {
    const found = this.store.scenes().find((s) => s.gestureFingers === fingers);
    return found ? found.name : 'Taken';
  }

  getWindowColorClass(index: number): string {
    const colors = [
      'bg-primary/25 border-primary/60 text-primary',
      'bg-armed/25 border-armed/60 text-armed',
      'bg-cyan-500/25 border-cyan-500/60 text-cyan-300',
      'bg-fuchsia-500/25 border-fuchsia-500/60 text-fuchsia-300',
      'bg-amber-500/25 border-amber-500/60 text-amber-300'
    ];
    return colors[index % colors.length];
  }

  private initializeAppsFromOpenCandidates(candidates: OpenWindowCandidate[]): void {
    const items: ConfigurableSceneAppItem[] = candidates.map((c, idx) => {
      const matchedPreset = this.inferPresetFromRect(c.rect, c.state);
      return {
        key: `open-${c.handle}-${idx}`,
        handle: c.handle,
        processName: c.processName,
        className: c.className,
        title: c.title,
        executablePath: c.executablePath ?? null,
        monitorDeviceName: c.monitorDeviceName,
        originalRect: { ...c.rect },
        originalState: c.state,
        selected: idx < 2, // Pre-select top 2 active windows for convenience
        presetId: matchedPreset,
        targetRect: { ...c.rect },
        targetState: c.state
      };
    });
    this.configurableApps.set(items);
  }

  private initializeAppsForEdit(
    scene: SceneSummary,
    openCandidates: OpenWindowCandidate[]
  ): void {
    const items: ConfigurableSceneAppItem[] = [];
    const usedCandidateHandles = new Set<number>();

    // 1. Add all windows already saved in the scene (marked selected = true)
    scene.windows.forEach((win, idx) => {
      const matchingLive = openCandidates.find(
        (c) =>
          !usedCandidateHandles.has(c.handle) &&
          c.processName.toLowerCase() === win.processName.toLowerCase()
      );
      if (matchingLive) {
        usedCandidateHandles.add(matchingLive.handle);
      }

      const presetId = this.inferPresetFromRect(win.rect, win.state);
      items.push({
        key: `saved-${idx}-${win.processName}`,
        handle: matchingLive?.handle ?? null,
        processName: win.processName,
        className: win.className ?? matchingLive?.className ?? '',
        title: win.titleHint || matchingLive?.title || win.processName,
        executablePath: win.executablePath ?? matchingLive?.executablePath ?? null,
        monitorDeviceName: matchingLive?.monitorDeviceName ?? '\\\\.\\DISPLAY1',
        originalRect: { ...win.rect },
        originalState: win.state,
        selected: true,
        presetId,
        targetRect: { ...win.rect },
        targetState: win.state
      });
    });

    // 2. Append any other currently open desktop windows (marked selected = false) so user can add them
    openCandidates.forEach((cand, idx) => {
      if (usedCandidateHandles.has(cand.handle)) return;
      items.push({
        key: `extra-${cand.handle}-${idx}`,
        handle: cand.handle,
        processName: cand.processName,
        className: cand.className,
        title: cand.title,
        executablePath: cand.executablePath ?? null,
        monitorDeviceName: cand.monitorDeviceName,
        originalRect: { ...cand.rect },
        originalState: cand.state,
        selected: false,
        presetId: this.inferPresetFromRect(cand.rect, cand.state),
        targetRect: { ...cand.rect },
        targetState: cand.state
      });
    });

    this.configurableApps.set(items);
  }

  private inferPresetFromRect(
    rect: WindowFractionalRect,
    state: SceneWindowState
  ): ScenePlacementPresetId {
    if (state === 'maximized') return 'maximized';
    const near = (a: number, b: number) => Math.abs(a - b) < 0.06;
    if (near(rect.x, 0) && near(rect.y, 0) && near(rect.w, 0.5) && near(rect.h, 1)) return 'left';
    if (near(rect.x, 0.5) && near(rect.y, 0) && near(rect.w, 0.5) && near(rect.h, 1)) return 'right';
    if (near(rect.x, 0) && near(rect.y, 0) && near(rect.w, 1) && near(rect.h, 1)) return 'maximized';
    if (near(rect.x, 0) && near(rect.y, 0) && near(rect.w, 0.5) && near(rect.h, 0.5)) return 'topLeft';
    if (near(rect.x, 0.5) && near(rect.y, 0) && near(rect.w, 0.5) && near(rect.h, 0.5)) return 'topRight';
    if (near(rect.x, 0) && near(rect.y, 0.5) && near(rect.w, 0.5) && near(rect.h, 0.5)) return 'bottomLeft';
    if (near(rect.x, 0.5) && near(rect.y, 0.5) && near(rect.w, 0.5) && near(rect.h, 0.5)) return 'bottomRight';
    if (near(rect.x, 0) && near(rect.y, 0) && near(rect.w, 1) && near(rect.h, 0.5)) return 'top';
    if (near(rect.x, 0) && near(rect.y, 0.5) && near(rect.w, 1) && near(rect.h, 0.5)) return 'bottom';
    return 'current';
  }
}
