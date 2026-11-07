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
    <!-- UNIFIED, OPAQUE, COMPACT & SCROLLABLE SCENES DIALOG -->
    <div
      *ngIf="store.scenesOpen() || isModalOpen()"
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 select-text"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenes-panel-title"
      (wheel)="$event.stopPropagation()">
      <!-- Solid Dark Backdrop (Blocks underlying HUD & camera feed completely) -->
      <div
        class="fixed inset-0 bg-[#05070d]/95"
        (click)="onBackdropClick()"
        aria-hidden="true"></div>

      <!-- Single Solid Dialog Container (Fits comfortably on screen: max-h-[82vh], max-w-2xl) -->
      <div
        class="relative z-10 flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#0d111a] text-slate-100 shadow-[0_24px_64px_rgba(0,0,0,0.95)]">

        <!-- ======================= VIEW 1: SAVED SCENES LIST ======================= -->
        <ng-container *ngIf="!isModalOpen()">
          <!-- Sticky Header -->
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-[#111723] px-5 py-3.5">
            <div class="flex items-center gap-3 min-w-0">
              <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/15 text-amber-300">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" />
                  <path d="M3 9h18M9 21V9" stroke-linecap="round" />
                </svg>
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 id="scenes-panel-title" class="font-display text-base font-bold text-white">
                    Wave Scenes
                  </h2>
                  <span class="rounded-md border border-slate-700 bg-[#1a2234] px-2 py-0.5 font-mono text-[11px] text-amber-300">
                    {{ store.scenes().length }}/20
                  </span>
                </div>
                <p class="truncate text-xs text-slate-400">
                  Launch &amp; snap your favorite apps into place with a 3-finger or 4-finger gesture.
                </p>
              </div>
            </div>

            <!-- Header Actions -->
            <div class="flex shrink-0 items-center gap-2">
              <button
                type="button"
                (click)="store.undoLastScene()"
                [disabled]="!store.undoAvailable()"
                class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition cursor-pointer"
                [ngClass]="
                  store.undoAvailable()
                    ? 'border-slate-600 bg-[#1a2234] text-slate-100 hover:border-amber-400/60'
                    : 'border-slate-800 bg-[#131926] text-slate-500 cursor-not-allowed'
                "
                title="Undo last scene layout (Hotkey: U)">
                <span>↩ Undo</span>
              </button>

              <button
                type="button"
                (click)="openSaveModal()"
                [disabled]="!store.settings().scenesEnabled"
                class="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 transition cursor-pointer disabled:opacity-40">
                <span>+ New Scene</span>
              </button>

              <button
                type="button"
                (click)="store.toggleScenesDrawer(false)"
                aria-label="Close Scenes panel"
                class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-[#1a2234] text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer transition">
                ✕
              </button>
            </div>
          </div>

          <!-- Live Control Status Banner -->
          <div
            class="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-5 py-2 text-xs"
            [ngClass]="store.liveControl() ? 'bg-emerald-950/70 text-emerald-300' : 'bg-amber-950/70 text-amber-200'">
            <div class="flex items-center gap-2">
              <span
                class="h-2 w-2 rounded-full"
                [ngClass]="store.liveControl() ? 'bg-emerald-400' : 'bg-amber-400'"></span>
              <span class="font-medium">
                {{
                  store.liveControl()
                    ? 'Live Control is ON — Testing or triggering a scene will move & launch your real desktop windows.'
                    : 'Practice Mode is ON — Turn on Live Control to actually move & launch your real windows!'
                }}
              </span>
            </div>
            <button
              *ngIf="!store.liveControl()"
              type="button"
              (click)="store.setLiveControl(true)"
              class="shrink-0 rounded-md bg-amber-400 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-950 hover:bg-amber-300 cursor-pointer">
              Turn ON Live Control
            </button>
          </div>

          <!-- Scrollable Body (min-h-0 guarantees flexbox scrollability) -->
          <div class="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
            <!-- Empty State -->
            <div
              *ngIf="store.scenes().length === 0 && !store.scenesLoading()"
              class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-[#131926] p-8 text-center space-y-3">
              <div class="text-sm font-semibold text-white">No saved scenes yet</div>
              <p class="max-w-md text-xs text-slate-300 leading-relaxed">
                Create a scene to pick which apps you want (e.g. Chrome on the Left Half, Antigravity on the Right Half) and trigger them anytime with a 3-finger or 4-finger gesture.
              </p>
              <button
                type="button"
                (click)="openSaveModal()"
                class="rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition cursor-pointer">
                + Create Your First Scene
              </button>
            </div>

            <!-- Loading State -->
            <div
              *ngIf="store.scenesLoading()"
              class="flex items-center justify-center p-8 font-mono text-xs text-slate-300 gap-2">
              Loading saved scenes…
            </div>

            <!-- Saved Scene Cards -->
            <div
              *ngFor="let scene of store.scenes()"
              class="flex flex-col gap-3 rounded-xl border border-slate-700 bg-[#151c2c] p-4 shadow-sm">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h3 class="font-display text-sm font-bold text-white truncate">
                      {{ scene.name }}
                    </h3>
                    <span
                      *ngIf="scene.gestureFingers"
                      class="rounded-md border border-emerald-500/40 bg-emerald-950 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-300">
                      🖐️ {{ scene.gestureFingers }}-Finger Gesture
                    </span>
                    <span
                      *ngIf="!scene.gestureFingers"
                      class="rounded-md border border-slate-700 bg-[#1d263b] px-2 py-0.5 font-mono text-[11px] text-slate-300">
                      Button Only
                    </span>
                  </div>

                  <!-- Clear Text Summary of Each App & Its Position -->
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <span
                      *ngFor="let win of scene.windows; let i = index"
                      class="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#0d111a] px-2.5 py-1 text-xs text-slate-200">
                      <span class="font-semibold text-amber-300">{{ win.processName }}</span>
                      <span class="text-slate-400">→</span>
                      <span class="font-mono text-[11px] text-white">{{ describeWindowZone(win.rect, win.state) }}</span>
                    </span>
                  </div>
                </div>

                <!-- Compact Visual Mini-Map -->
                <div class="relative h-14 w-24 shrink-0 rounded-lg border border-slate-600 bg-[#090c12] overflow-hidden">
                  <div
                    *ngFor="let win of scene.windows; let i = index"
                    class="absolute border text-[8px] font-mono font-bold flex items-center justify-center overflow-hidden px-0.5"
                    [style.left.%]="win.rect.x * 100"
                    [style.top.%]="win.rect.y * 100"
                    [style.width.%]="win.rect.w * 100"
                    [style.height.%]="win.rect.h * 100"
                    [ngClass]="getWindowColorClass(i)">
                    <span class="truncate">{{ win.processName }}</span>
                  </div>
                </div>
              </div>

              <!-- Card Footer Buttons -->
              <div class="flex items-center justify-between border-t border-slate-800 pt-2.5">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    (click)="openEditModal(scene)"
                    class="rounded-lg border border-slate-700 bg-[#1d263b] px-3 py-1 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-white transition cursor-pointer">
                    Edit Apps &amp; Layout
                  </button>
                  <button
                    type="button"
                    (click)="store.deleteScene(scene.id)"
                    class="rounded-lg border border-red-900/60 bg-red-950/40 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-900/50 transition cursor-pointer">
                    Delete
                  </button>
                </div>

                <button
                  type="button"
                  (click)="testSceneNow(scene)"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 transition cursor-pointer">
                  <span>▶ Run Scene Now</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Sticky Footer -->
          <div class="flex shrink-0 items-center justify-between border-t border-slate-800 bg-[#111723] px-5 py-2.5 font-mono text-[11px] text-slate-400">
            <span>Tip: Hold 3 or 4 fingers steady in front of the camera to trigger your scene.</span>
            <button
              type="button"
              (click)="store.toggleScenesDrawer(false)"
              class="rounded-lg border border-slate-700 bg-[#1a2234] px-3 py-1 text-xs text-slate-200 hover:text-white cursor-pointer">
              Close
            </button>
          </div>
        </ng-container>

        <!-- ======================= VIEW 2: SCENE BUILDER / EDITOR ======================= -->
        <ng-container *ngIf="isModalOpen()">
          <!-- Sticky Header -->
          <div class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-[#111723] px-5 py-3.5">
            <div>
              <h2 id="scenes-panel-title" class="font-display text-base font-bold text-white">
                {{ editingSceneId() ? 'Edit Scene Layout' : 'Create New Scene' }}
              </h2>
              <p class="text-xs text-slate-400">
                Follow the 3 simple steps below to choose your apps and where they go on screen.
              </p>
            </div>
            <button
              type="button"
              (click)="closeModal()"
              class="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-[#1a2234] text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer">
              ✕
            </button>
          </div>

          <!-- Scrollable Builder Body (min-h-0 ensures smooth vertical scrolling) -->
          <div class="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <!-- STEP 1 & 2: Name + Gesture Trigger -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-[#141b29] p-3.5">
              <!-- Step 1: Scene Name -->
              <div class="space-y-1.5">
                <label for="scene-name-input" class="block font-mono text-[11px] font-bold uppercase text-amber-300">
                  Step 1 · Scene Name
                </label>
                <input
                  id="scene-name-input"
                  type="text"
                  maxlength="60"
                  [(ngModel)]="modalName"
                  placeholder="e.g. Coding Split"
                  class="w-full rounded-lg border border-slate-700 bg-[#0b0f17] px-3 py-2 text-xs font-medium text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />
              </div>

              <!-- Step 2: Hand Gesture Trigger -->
              <div class="space-y-1.5">
                <label class="block font-mono text-[11px] font-bold uppercase text-amber-300">
                  Step 2 · Hand Gesture Shortcut
                </label>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    (click)="!isGestureTaken(3) && (modalGesture = 3)"
                    [disabled]="isGestureTaken(3)"
                    class="rounded-lg border px-2 py-2 text-center text-xs font-medium transition cursor-pointer"
                    [ngClass]="{
                      'border-emerald-400 bg-emerald-950 text-emerald-200 font-bold': modalGesture === 3,
                      'border-slate-700 bg-[#0b0f17] text-slate-300 hover:border-slate-500': modalGesture !== 3 && !isGestureTaken(3),
                      'border-slate-800 bg-[#0b0f17]/50 text-slate-600 cursor-not-allowed': isGestureTaken(3)
                    }">
                    🖐️ 3 Fingers
                  </button>

                  <button
                    type="button"
                    (click)="!isGestureTaken(4) && (modalGesture = 4)"
                    [disabled]="isGestureTaken(4)"
                    class="rounded-lg border px-2 py-2 text-center text-xs font-medium transition cursor-pointer"
                    [ngClass]="{
                      'border-emerald-400 bg-emerald-950 text-emerald-200 font-bold': modalGesture === 4,
                      'border-slate-700 bg-[#0b0f17] text-slate-300 hover:border-slate-500': modalGesture !== 4 && !isGestureTaken(4),
                      'border-slate-800 bg-[#0b0f17]/50 text-slate-600 cursor-not-allowed': isGestureTaken(4)
                    }">
                    🖐️ 4 Fingers
                  </button>

                  <button
                    type="button"
                    (click)="modalGesture = null"
                    class="rounded-lg border px-2 py-2 text-center text-xs font-medium transition cursor-pointer"
                    [ngClass]="
                      modalGesture === null
                        ? 'border-amber-400 bg-amber-950/80 text-amber-200 font-bold'
                        : 'border-slate-700 bg-[#0b0f17] text-slate-300 hover:border-slate-500'
                    ">
                    None
                  </button>
                </div>
              </div>
            </div>

            <!-- Compact Live Screen Preview -->
            <div class="rounded-xl border border-slate-800 bg-[#141b29] p-3.5 space-y-2">
              <div class="flex items-center justify-between">
                <span class="font-mono text-[11px] font-bold uppercase text-slate-300">
                  Screen Layout Preview ({{ selectedAppCount() }} {{ selectedAppCount() === 1 ? 'app' : 'apps' }} checked)
                </span>
                <span class="font-mono text-[11px] text-slate-400">
                  Shows where checked apps will be placed
                </span>
              </div>
              <div class="relative h-24 w-full rounded-lg border border-slate-700 bg-[#080b11] overflow-hidden">
                <!-- Half-screen center divider line -->
                <div class="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-800 pointer-events-none"></div>

                <div
                  *ngIf="selectedApps().length === 0"
                  class="absolute inset-0 flex items-center justify-center font-mono text-xs text-slate-500">
                  Check at least one app in Step 3 below
                </div>

                <div
                  *ngFor="let item of selectedApps(); let i = index"
                  class="absolute border rounded-md flex flex-col items-center justify-center overflow-hidden p-1 text-center transition-all duration-150"
                  [style.left.%]="item.targetRect.x * 100"
                  [style.top.%]="item.targetRect.y * 100"
                  [style.width.%]="item.targetRect.w * 100"
                  [style.height.%]="item.targetRect.h * 100"
                  [ngClass]="getWindowColorClass(i)">
                  <span class="font-display text-xs font-bold truncate max-w-full">
                    {{ item.processName }}
                  </span>
                  <span class="font-mono text-[10px] truncate max-w-full">
                    {{ getPresetShortLabel(item.presetId) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- STEP 3: Check Apps & Choose Screen Side -->
            <div class="space-y-2.5">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <label class="font-mono text-[11px] font-bold uppercase text-amber-300">
                  Step 3 · Check Apps &amp; Pick Their Screen Position
                </label>

                <div class="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    (click)="addPresetApp('Notepad', 'notepad.exe', 'Notepad')"
                    class="rounded-md border border-slate-700 bg-[#1a2234] px-2 py-1 font-mono text-[11px] text-slate-200 hover:border-amber-400 cursor-pointer">
                    + Notepad
                  </button>
                  <button
                    type="button"
                    (click)="addPresetApp('CalculatorApp', 'calc.exe', 'Calculator')"
                    class="rounded-md border border-slate-700 bg-[#1a2234] px-2 py-1 font-mono text-[11px] text-slate-200 hover:border-amber-400 cursor-pointer">
                    + Calculator
                  </button>
                  <button
                    type="button"
                    (click)="refreshOpenApps()"
                    class="rounded-md border border-amber-400/50 bg-amber-950/60 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-300 hover:bg-amber-900/60 cursor-pointer">
                    ↻ Refresh Open Windows
                  </button>
                </div>
              </div>

              <!-- List of Open Windows -->
              <div class="space-y-2">
                <div
                  *ngIf="configurableApps().length === 0"
                  class="rounded-xl border border-dashed border-slate-700 bg-[#131926] p-5 text-center text-xs text-slate-400">
                  No open desktop windows detected. Open an app and click <strong>Refresh Open Windows</strong>.
                </div>

                <div
                  *ngFor="let app of configurableApps(); let idx = index"
                  class="rounded-xl border p-3 transition"
                  [ngClass]="
                    app.selected
                      ? 'border-amber-400/70 bg-[#182235]'
                      : 'border-slate-800 bg-[#111622] hover:border-slate-700'
                  ">
                  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <!-- Checkbox + App Name -->
                    <label class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        [checked]="app.selected"
                        (change)="toggleAppSelection(idx)"
                        class="h-4 w-4 rounded border-slate-600 accent-amber-400 cursor-pointer shrink-0" />
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <span class="font-display text-xs font-bold text-white truncate">
                            {{ app.processName }}
                          </span>
                          <span
                            *ngIf="app.selected"
                            class="rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-amber-300">
                            {{ getPresetShortLabel(app.presetId) }}
                          </span>
                        </div>
                        <div class="text-[11px] text-slate-400 truncate">
                          {{ app.title }}
                        </div>
                      </div>
                    </label>

                    <!-- Clear Position Buttons -->
                    <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <button
                        type="button"
                        (click)="setAppPreset(idx, 'left')"
                        class="rounded-lg border px-2.5 py-1 font-mono text-[11px] transition cursor-pointer"
                        [ngClass]="
                          app.selected && app.presetId === 'left'
                            ? 'border-amber-400 bg-amber-400 text-slate-950 font-bold'
                            : 'border-slate-700 bg-[#0d111a] text-slate-300 hover:border-slate-500'
                        ">
                        ◧ Left Half
                      </button>

                      <button
                        type="button"
                        (click)="setAppPreset(idx, 'right')"
                        class="rounded-lg border px-2.5 py-1 font-mono text-[11px] transition cursor-pointer"
                        [ngClass]="
                          app.selected && app.presetId === 'right'
                            ? 'border-amber-400 bg-amber-400 text-slate-950 font-bold'
                            : 'border-slate-700 bg-[#0d111a] text-slate-300 hover:border-slate-500'
                        ">
                        ◨ Right Half
                      </button>

                      <button
                        type="button"
                        (click)="setAppPreset(idx, 'maximized')"
                        class="rounded-lg border px-2.5 py-1 font-mono text-[11px] transition cursor-pointer"
                        [ngClass]="
                          app.selected && app.presetId === 'maximized'
                            ? 'border-amber-400 bg-amber-400 text-slate-950 font-bold'
                            : 'border-slate-700 bg-[#0d111a] text-slate-300 hover:border-slate-500'
                        ">
                        ⬜ Full
                      </button>

                      <select
                        [ngModel]="app.presetId"
                        (ngModelChange)="setAppPreset(idx, $event)"
                        aria-label="More screen positions"
                        class="rounded-lg border border-slate-700 bg-[#0d111a] px-2 py-1 font-mono text-[11px] text-slate-200 focus:border-amber-400 focus:outline-none cursor-pointer">
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

          <!-- Sticky Builder Footer -->
          <div class="flex shrink-0 items-center justify-between gap-2 border-t border-slate-800 bg-[#111723] px-5 py-3">
            <span class="font-mono text-xs text-slate-300">
              {{ selectedAppCount() === 0 ? 'Check at least 1 app above' : selectedAppCount() + ' app(s) ready to save' }}
            </span>

            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="closeModal()"
                class="rounded-lg border border-slate-700 bg-[#1a2234] px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:text-white cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                (click)="saveModal(false)"
                [disabled]="selectedAppCount() === 0"
                class="rounded-lg border border-amber-400/60 bg-[#1f293d] px-4 py-1.5 text-xs font-bold text-amber-300 hover:bg-[#27344d] cursor-pointer disabled:opacity-40">
                Save Only
              </button>
              <button
                type="button"
                (click)="saveModal(true)"
                [disabled]="selectedAppCount() === 0"
                class="rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 cursor-pointer disabled:opacity-40">
                Save &amp; Test Layout Now
              </button>
            </div>
          </div>
        </ng-container>
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

  onBackdropClick(): void {
    if (this.isModalOpen()) {
      this.closeModal();
    } else {
      this.store.toggleScenesDrawer(false);
    }
  }

  async testSceneNow(scene: SceneSummary): Promise<void> {
    if (!this.store.liveControl()) {
      this.store.setLiveControl(true);
    }
    this.store.toggleScenesDrawer(false);
    await this.store.applyScene(scene);
  }

  describeWindowZone(rect: WindowFractionalRect, state: SceneWindowState): string {
    const preset = this.inferPresetFromRect(rect, state);
    return this.getPresetShortLabel(preset);
  }

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
          key: `win-${cand.handle}-${merged.length}`,
          handle: cand.handle,
          processName: cand.processName,
          className: cand.className,
          title: cand.title,
          executablePath: cand.executablePath ?? null,
          monitorDeviceName: cand.monitorDeviceName,
          originalRect: { ...cand.rect },
          originalState: cand.state,
          selected: false,
          presetId: 'left',
          targetRect: { x: 0, y: 0, w: 0.5, h: 1 },
          targetState: 'normal'
        });
      }
    }
    this.configurableApps.set(merged);
  }

  addPresetApp(processName: string, executablePath: string, friendlyTitle: string): void {
    const current = this.configurableApps();
    const selectedCount = current.filter((a) => a.selected).length;
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
    this.configurableApps.update((list) => {
      const currentSelectedCount = list.filter((a) => a.selected).length;
      return list.map((item, idx) => {
        if (idx !== index) return item;
        const nextSelected = !item.selected;
        if (nextSelected && (item.presetId === 'maximized' || item.presetId === 'current')) {
          const autoPreset: ScenePlacementPresetId =
            currentSelectedCount === 0 ? 'left' : currentSelectedCount === 1 ? 'right' : item.presetId;
          const presetObj = SCENE_PLACEMENT_PRESETS.find((p) => p.id === autoPreset);
          if (presetObj && presetObj.rect) {
            return {
              ...item,
              selected: true,
              presetId: autoPreset,
              targetRect: { ...presetObj.rect },
              targetState: presetObj.state ?? 'normal'
            };
          }
        }
        return { ...item, selected: nextSelected };
      });
    });
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

  async saveModal(applyImmediately = false): Promise<void> {
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

    const editId = this.editingSceneId();
    if (editId) {
      await this.store.updateScene(editId, name, gesture, selectedWindows);
    } else {
      await this.store.captureCurrentScene(name, gesture, selectedWindows);
    }

    this.closeModal();

    if (applyImmediately) {
      if (!this.store.liveControl()) {
        this.store.setLiveControl(true);
      }
      const savedScene = editId
        ? this.store.scenes().find((s) => s.id === editId)
        : this.store.scenes()[0];
      if (savedScene) {
        this.store.toggleScenesDrawer(false);
        await this.store.applyScene(savedScene);
      }
    }
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
      'bg-amber-500/35 border-amber-400 text-amber-100',
      'bg-emerald-500/35 border-emerald-400 text-emerald-100',
      'bg-sky-500/35 border-sky-400 text-sky-100',
      'bg-fuchsia-500/35 border-fuchsia-400 text-fuchsia-100'
    ];
    return colors[index % colors.length];
  }

  private initializeAppsFromOpenCandidates(candidates: OpenWindowCandidate[]): void {
    // Default the first two selected windows to a clean Left Half / Right Half split!
    const items: ConfigurableSceneAppItem[] = candidates.map((c, idx) => {
      const defaultSelected = idx < 2;
      const defaultPreset: ScenePlacementPresetId =
        idx === 0 ? 'left' : idx === 1 ? 'right' : this.inferPresetFromRect(c.rect, c.state);
      const presetObj = SCENE_PLACEMENT_PRESETS.find((p) => p.id === defaultPreset);

      const targetRect: WindowFractionalRect =
        defaultSelected && presetObj?.rect ? { ...presetObj.rect } : { ...c.rect };
      const targetState: SceneWindowState =
        defaultSelected && presetObj?.state ? presetObj.state : c.state;

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
        selected: defaultSelected,
        presetId: defaultPreset,
        targetRect,
        targetState
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

    scene.windows.forEach((win, idx) => {
      const matchingLive =
        openCandidates.find(
          (c) =>
            !usedCandidateHandles.has(c.handle) &&
            win.handle &&
            c.handle === win.handle
        ) ??
        openCandidates.find(
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
        handle: win.handle ?? matchingLive?.handle ?? null,
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
        presetId: 'left',
        targetRect: { x: 0, y: 0, w: 0.5, h: 1 },
        targetState: 'normal'
      });
    });

    this.configurableApps.set(items);
  }

  private inferPresetFromRect(
    rect: WindowFractionalRect,
    state: SceneWindowState
  ): ScenePlacementPresetId {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.06;
    if (near(rect.x, 0) && near(rect.y, 0) && near(rect.w, 0.5) && near(rect.h, 1)) return 'left';
    if (near(rect.x, 0.5) && near(rect.y, 0) && near(rect.w, 0.5) && near(rect.h, 1)) return 'right';
    if (near(rect.x, 0) && near(rect.y, 0) && near(rect.w, 0.5) && near(rect.h, 0.5)) return 'topLeft';
    if (near(rect.x, 0.5) && near(rect.y, 0) && near(rect.w, 0.5) && near(rect.h, 0.5)) return 'topRight';
    if (near(rect.x, 0) && near(rect.y, 0.5) && near(rect.w, 0.5) && near(rect.h, 0.5)) return 'bottomLeft';
    if (near(rect.x, 0.5) && near(rect.y, 0.5) && near(rect.w, 0.5) && near(rect.h, 0.5)) return 'bottomRight';
    if (near(rect.x, 0) && near(rect.y, 0) && near(rect.w, 1) && near(rect.h, 0.5)) return 'top';
    if (near(rect.x, 0) && near(rect.y, 0.5) && near(rect.w, 1) && near(rect.h, 0.5)) return 'bottom';
    if (state === 'maximized' || (near(rect.x, 0) && near(rect.y, 0) && near(rect.w, 1) && near(rect.h, 1))) return 'maximized';
    return 'current';
  }
}
