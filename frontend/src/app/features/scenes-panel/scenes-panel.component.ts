import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WaveViewModelStore } from '../../core/services/wave-view-model.store';
import { SceneSummary, SceneWindowSummary } from '../../core/models/scene.model';

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
        class="relative z-10 flex h-[90vh] max-h-[800px] w-full max-w-4xl flex-col rounded-3xl border border-glass-border glass-strong shadow-2xl overflow-hidden">
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
                Save desktop layouts and restore them with 3 or 4 fingers.
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

            <!-- Save Current Layout Button -->
            <button
              type="button"
              (click)="openSaveModal()"
              [disabled]="!store.settings().scenesEnabled"
              class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition cursor-pointer">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" stroke-linecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" stroke-linecap="round" />
              </svg>
              <span>Save current layout</span>
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
              Arrange your open windows on your desktop however you like, then click
              <strong class="text-foreground">"Save current layout"</strong> above. You can assign a 3-finger or 4-finger hand gesture to snap them back into place anytime.
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
                      {{ scene.windowCount }} {{ scene.windowCount === 1 ? 'window' : 'windows' }}
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
                    <div class="absolute inset-0 opacity-10 pointer-events-none grid grid-cols-4 grid-rows-3 gap-0.5 p-1">
                      <div *ngFor="let _ of [1,2,3,4,5,6,7,8,9,10,11,12]" class="border border-foreground/30"></div>
                    </div>

                    <!-- Window Rectangles inside Schematic -->
                    <div
                      *ngFor="let win of scene.windows; let i = index"
                      class="absolute rounded transition-all shadow-sm border text-[9px] font-mono flex items-center justify-center overflow-hidden font-medium select-none"
                      [style.left.%]="win.rect.x * 100"
                      [style.top.%]="win.rect.y * 100"
                      [style.width.%]="win.rect.w * 100"
                      [style.height.%]="win.rect.h * 100"
                      [ngClass]="getWindowColorClass(i)">
                      <span class="truncate px-1">{{ win.processName }}</span>
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
                    title="Rename or change gesture">
                    <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 20h9" stroke-linecap="round" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    Edit
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

                <!-- Apply Button -->
                <button
                  type="button"
                  (click)="store.applyScene(scene)"
                  class="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 font-display text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition cursor-pointer">
                  <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Apply</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer Privacy Note -->
        <div class="flex items-center justify-between border-t border-glass-border px-5 py-3 text-[11px] font-mono text-muted-foreground flex-wrap gap-2">
          <span>Windows are restored relative to your monitor work area.</span>
          <span>{{ store.liveControl() ? 'Live Mode Active' : 'Practice Mode (Simulated)' }}</span>
        </div>
      </div>
    </div>

    <!-- SAVE / EDIT SCENE MODAL -->
    <div
      *ngIf="isModalOpen()"
      class="fixed inset-0 z-60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scene-dialog-title">
      <div
        class="fixed inset-0 bg-background/80 backdrop-blur-md"
        (click)="closeModal()"
        aria-hidden="true"></div>

      <div class="relative z-10 w-full max-w-md rounded-3xl border border-glass-border glass-strong p-6 shadow-2xl space-y-4">
        <h3 id="scene-dialog-title" class="font-display text-lg font-bold text-foreground">
          {{ editingSceneId() ? 'Edit Scene' : 'Save Current Layout' }}
        </h3>

        <!-- Scene Name Input -->
        <div class="space-y-1.5">
          <label for="scene-name-input" class="font-mono text-xs text-muted-foreground uppercase">
            Scene Name
          </label>
          <input
            id="scene-name-input"
            type="text"
            maxlength="60"
            [(ngModel)]="modalName"
            placeholder="e.g. Coding Setup, Split Screen"
            class="w-full rounded-xl border border-glass-border bg-secondary/60 px-3.5 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none" />
        </div>

        <!-- Gesture Fingers Selector -->
        <div class="space-y-1.5">
          <label class="font-mono text-xs text-muted-foreground uppercase">
            Gesture Shortcut
          </label>
          <div class="grid grid-cols-3 gap-2">
            <!-- Option None -->
            <button
              type="button"
              (click)="modalGesture = null"
              class="flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition cursor-pointer"
              [ngClass]="modalGesture === null ? 'border-primary bg-primary/15 text-primary' : 'border-glass-border bg-secondary/40 text-muted-foreground'">
              <span class="text-sm">🔘</span>
              <span class="mt-1 text-xs font-medium">None</span>
              <span class="text-[9px] opacity-70">Button only</span>
            </button>

            <!-- Option 3 Fingers -->
            <button
              type="button"
              (click)="!isGestureTaken(3) && (modalGesture = 3)"
              [disabled]="isGestureTaken(3)"
              class="flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition cursor-pointer"
              [ngClass]="{
                'border-armed bg-armed/15 text-armed font-semibold': modalGesture === 3,
                'border-glass-border bg-secondary/40 text-muted-foreground': modalGesture !== 3 && !isGestureTaken(3),
                'border-glass-border/30 bg-secondary/20 text-muted-foreground/40 cursor-not-allowed opacity-50': isGestureTaken(3)
              }">
              <span class="text-sm">🖐️ 3</span>
              <span class="mt-1 text-xs font-medium">3 Fingers</span>
              <span class="text-[9px] truncate max-w-full">
                {{ isGestureTaken(3) ? '(' + getGestureTakenName(3) + ')' : 'Peace + Ring' }}
              </span>
            </button>

            <!-- Option 4 Fingers -->
            <button
              type="button"
              (click)="!isGestureTaken(4) && (modalGesture = 4)"
              [disabled]="isGestureTaken(4)"
              class="flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition cursor-pointer"
              [ngClass]="{
                'border-armed bg-armed/15 text-armed font-semibold': modalGesture === 4,
                'border-glass-border bg-secondary/40 text-muted-foreground': modalGesture !== 4 && !isGestureTaken(4),
                'border-glass-border/30 bg-secondary/20 text-muted-foreground/40 cursor-not-allowed opacity-50': isGestureTaken(4)
              }">
              <span class="text-sm">🖐️ 4</span>
              <span class="mt-1 text-xs font-medium">4 Fingers</span>
              <span class="text-[9px] truncate max-w-full">
                {{ isGestureTaken(4) ? '(' + getGestureTakenName(4) + ')' : 'Thumb tucked' }}
              </span>
            </button>
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            (click)="closeModal()"
            class="rounded-xl border border-glass-border bg-secondary/50 px-4 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition cursor-pointer">
            Cancel
          </button>
          <button
            type="button"
            (click)="saveModal()"
            class="rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 transition cursor-pointer">
            {{ editingSceneId() ? 'Save Changes' : 'Save Scene' }}
          </button>
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

  modalName = '';
  modalGesture: 3 | 4 | null = null;

  openSaveModal(): void {
    this.editingSceneId.set(null);
    this.modalName = `Layout ${this.store.scenes().length + 1}`;
    // Default to first untaken gesture
    if (!this.isGestureTaken(3)) {
      this.modalGesture = 3;
    } else if (!this.isGestureTaken(4)) {
      this.modalGesture = 4;
    } else {
      this.modalGesture = null;
    }
    this.isModalOpen.set(true);
  }

  openEditModal(scene: SceneSummary): void {
    this.editingSceneId.set(scene.id);
    this.modalName = scene.name;
    this.modalGesture = scene.gestureFingers;
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingSceneId.set(null);
  }

  async saveModal(): Promise<void> {
    const name = this.modalName.trim() || 'Untitled Scene';
    const gesture = this.modalGesture;

    if (this.editingSceneId()) {
      await this.store.updateScene(this.editingSceneId()!, name, gesture);
    } else {
      await this.store.captureCurrentScene(name, gesture);
    }

    this.closeModal();
  }

  isGestureTaken(fingers: 3 | 4): boolean {
    const editId = this.editingSceneId();
    return this.store.scenes().some((s) => s.gestureFingers === fingers && s.id !== editId);
  }

  getGestureTakenName(fingers: 3 | 4): string {
    const found = this.store.scenes().find((s) => s.gestureFingers === fingers);
    return found ? found.name : 'Taken';
  }

  getWindowColorClass(index: number): string {
    const colors = [
      'bg-primary/25 border-primary/50 text-primary',
      'bg-armed/25 border-armed/50 text-armed',
      'bg-cyan-500/25 border-cyan-500/50 text-cyan-300',
      'bg-fuchsia-500/25 border-fuchsia-500/50 text-fuchsia-300',
      'bg-amber-500/25 border-amber-500/50 text-amber-300'
    ];
    return colors[index % colors.length];
  }
}
