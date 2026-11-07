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
  styles: [
    `
      .scenes-backdrop {
        position: fixed;
        inset: 0;
        z-index: 90;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        background: rgba(5, 8, 15, 0.92);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }

      .scenes-dialog {
        position: relative;
        z-index: 95;
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 780px;
        max-height: 84vh;
        background: #0d121d;
        color: #f8fafc;
        border: 1px solid #2e3a52;
        border-radius: 20px;
        box-shadow: 0 28px 70px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.06);
        overflow: hidden;
        user-select: none;
      }

      .scenes-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 22px;
        background: #131b2b;
        border-bottom: 1px solid #263147;
        flex-shrink: 0;
        flex-wrap: wrap;
      }

      .scenes-header-title-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .scenes-icon-box {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: rgba(245, 196, 81, 0.15);
        border: 1px solid rgba(245, 196, 81, 0.45);
        color: #f5c451;
        flex-shrink: 0;
      }

      .scenes-title {
        font-size: 18px;
        font-weight: 700;
        color: #ffffff;
        margin: 0;
        line-height: 1.2;
      }

      .scenes-subtitle {
        font-size: 12px;
        color: #94a3b8;
        margin: 3px 0 0 0;
      }

      .scenes-count-pill {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        font-weight: 600;
        background: #1e293b;
        border: 1px solid #334155;
        color: #f5c451;
        margin-left: 8px;
      }

      .scenes-status-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 22px;
        font-size: 12px;
        flex-shrink: 0;
        border-bottom: 1px solid #263147;
      }

      .scenes-status-live {
        background: #0c291e;
        color: #6ee7b7;
      }

      .scenes-status-practice {
        background: #2b1f0c;
        color: #fcd34d;
      }

      .scenes-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 20px 22px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        background: #0d121d;
      }

      .scenes-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 22px;
        background: #131b2b;
        border-top: 1px solid #263147;
        flex-shrink: 0;
        flex-wrap: wrap;
      }

      /* Buttons */
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: 10px;
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
        line-height: 1.2;
      }

      .btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .btn-gold {
        background: #f5c451;
        color: #0b0f19;
        border-color: #f5c451;
        font-weight: 700;
      }

      .btn-gold:hover:not(:disabled) {
        background: #fbd36b;
      }

      .btn-secondary {
        background: #1e293b;
        color: #e2e8f0;
        border-color: #334155;
      }

      .btn-secondary:hover:not(:disabled) {
        background: #283548;
        border-color: #475569;
        color: #ffffff;
      }

      .btn-danger {
        background: rgba(239, 68, 68, 0.14);
        color: #fca5a5;
        border-color: rgba(239, 68, 68, 0.35);
      }

      .btn-danger:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.25);
        color: #fecaca;
      }

      .btn-close {
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 10px;
        background: #1e293b;
        color: #cbd5e1;
        border: 1px solid #334155;
        font-size: 15px;
        cursor: pointer;
      }

      .btn-close:hover {
        background: #334155;
        color: #ffffff;
      }

      /* Saved Scene Card */
      .scene-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px 18px;
        background: #151e30;
        border: 1px solid #2b3954;
        border-radius: 14px;
      }

      .scene-card:hover {
        border-color: #43567d;
      }

      .scene-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .scene-badge-gesture {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 999px;
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        font-weight: 700;
        background: #0d3326;
        color: #6ee7b7;
        border: 1px solid #10b981;
      }

      .scene-badge-none {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 999px;
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        background: #1e293b;
        color: #94a3b8;
        border: 1px solid #334155;
      }

      .scene-app-pill-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }

      .scene-app-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 8px;
        background: #0b101b;
        border: 1px solid #28354e;
        font-size: 12px;
        color: #e2e8f0;
      }

      .scene-minimap {
        position: relative;
        width: 128px;
        height: 74px;
        border-radius: 10px;
        background: #080b12;
        border: 1px solid #334155;
        overflow: hidden;
        flex-shrink: 0;
      }

      .scene-card-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 12px;
        border-top: 1px solid #232f46;
        flex-wrap: wrap;
      }

      /* Empty State */
      .scenes-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 36px 24px;
        background: #131b2b;
        border: 1px dashed #334155;
        border-radius: 16px;
        gap: 12px;
      }

      /* Editor Step Sections */
      .step-box {
        background: #141c2c;
        border: 1px solid #293650;
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .step-label {
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #f5c451;
        margin: 0;
      }

      .text-input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        background: #090d16;
        border: 1px solid #334155;
        color: #ffffff;
        font-size: 13px;
        font-weight: 500;
        outline: none;
      }

      .text-input:focus {
        border-color: #f5c451;
      }

      .gesture-choice-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }

      .gesture-choice-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 10px 8px;
        border-radius: 10px;
        background: #090d16;
        border: 1px solid #2e3c56;
        color: #cbd5e1;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.15s ease;
      }

      .gesture-choice-btn:hover:not(:disabled) {
        border-color: #64748b;
        color: #ffffff;
      }

      .gesture-choice-btn.active {
        background: #0d3326;
        border-color: #10b981;
        color: #6ee7b7;
      }

      .gesture-choice-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* Live Screen Preview Box */
      .screen-preview-frame {
        position: relative;
        width: 100%;
        height: 115px;
        border-radius: 12px;
        background: #080b12;
        border: 2px solid #2e3c56;
        overflow: hidden;
      }

      .screen-preview-window {
        position: absolute;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4px;
        border-radius: 6px;
        text-align: center;
        overflow: hidden;
        transition: all 0.18s ease;
        box-sizing: border-box;
      }

      .win-color-0 {
        background: rgba(245, 196, 81, 0.25);
        border: 2px solid #f5c451;
        color: #fef08a;
      }

      .win-color-1 {
        background: rgba(16, 185, 129, 0.25);
        border: 2px solid #10b981;
        color: #a7f3d0;
      }

      .win-color-2 {
        background: rgba(56, 189, 248, 0.25);
        border: 2px solid #38bdf8;
        color: #bae6fd;
      }

      .win-color-3 {
        background: rgba(217, 70, 239, 0.25);
        border: 2px solid #d946ef;
        color: #f5d0fe;
      }

      /* App Selection Rows */
      .app-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 12px;
        background: #0e1422;
        border: 1px solid #253148;
        flex-wrap: wrap;
        transition: all 0.15s ease;
      }

      .app-row.selected {
        background: #172238;
        border-color: #f5c451;
      }

      .app-row-left {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 180px;
        flex: 1 1 220px;
        cursor: pointer;
      }

      .app-checkbox {
        width: 18px;
        height: 18px;
        accent-color: #f5c451;
        cursor: pointer;
        flex-shrink: 0;
      }

      .app-name {
        font-size: 13px;
        font-weight: 700;
        color: #ffffff;
      }

      .app-title {
        font-size: 11px;
        color: #94a3b8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 280px;
      }

      .app-row-right {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .zone-btn {
        padding: 6px 10px;
        border-radius: 8px;
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        font-weight: 600;
        background: #090d16;
        color: #cbd5e1;
        border: 1px solid #2e3c56;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .zone-btn:hover {
        border-color: #64748b;
        color: #ffffff;
      }

      .zone-btn.active {
        background: #f5c451;
        color: #0b0f19;
        border-color: #f5c451;
        font-weight: 700;
      }

      .zone-select {
        padding: 6px 10px;
        border-radius: 8px;
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        background: #090d16;
        color: #e2e8f0;
        border: 1px solid #2e3c56;
        cursor: pointer;
        outline: none;
      }

      .zone-select:focus {
        border-color: #f5c451;
      }
    `
  ],
  template: `
    <div
      *ngIf="store.scenesOpen() || isModalOpen()"
      class="scenes-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scenes-panel-title"
      (wheel)="$event.stopPropagation()"
      (click)="onBackdropClick()">

      <!-- Solid Opaque Dialog Card (Stop click propagation so clicking inside doesn't close) -->
      <div class="scenes-dialog" (click)="$event.stopPropagation()">

        <!-- ======================= VIEW 1: SAVED SCENES LIST ======================= -->
        <ng-container *ngIf="!isModalOpen()">
          <!-- Header -->
          <div class="scenes-header">
            <div class="scenes-header-title-row">
              <div class="scenes-icon-box">
                <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke-linecap="round" />
                  <path d="M3 9h18M9 21V9" stroke-linecap="round" />
                </svg>
              </div>
              <div>
                <div class="flex items-center">
                  <h2 id="scenes-panel-title" class="scenes-title">Wave Scenes</h2>
                  <span class="scenes-count-pill">{{ store.scenes().length }} / 20</span>
                </div>
                <p class="scenes-subtitle">
                  Pick your apps, choose their screen side, and launch them with a 3-finger or 4-finger gesture.
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="btn btn-secondary"
                (click)="store.undoLastScene()"
                [disabled]="!store.undoAvailable()"
                title="Undo last scene layout (Hotkey: U)">
                ↩ Undo
              </button>

              <button
                type="button"
                class="btn btn-gold"
                (click)="openSaveModal()"
                [disabled]="!store.settings().scenesEnabled">
                + New Scene
              </button>

              <button
                type="button"
                class="btn-close"
                (click)="store.toggleScenesDrawer(false)"
                aria-label="Close Scenes panel">
                ✕
              </button>
            </div>
          </div>

          <!-- Live Control Status Bar -->
          <div
            class="scenes-status-banner"
            [ngClass]="store.liveControl() ? 'scenes-status-live' : 'scenes-status-practice'">
            <span>
              {{
                store.liveControl()
                  ? '● Live Control is ON — Running a scene or holding 3/4 fingers will move & launch your real windows.'
                  : '○ Practice Mode is ON — Turn on Live Control so scenes move your real desktop windows!'
              }}
            </span>
            <button
              *ngIf="!store.liveControl()"
              type="button"
              class="btn btn-gold"
              style="padding: 4px 10px; font-size: 11px;"
              (click)="store.setLiveControl(true)">
              Turn ON Live Control
            </button>
          </div>

          <!-- Scrollable List Body -->
          <div class="scenes-body">
            <!-- Empty State -->
            <div
              *ngIf="store.scenes().length === 0 && !store.scenesLoading()"
              class="scenes-empty">
              <div style="font-size: 16px; font-weight: 700; color: #ffffff;">
                No saved scenes yet
              </div>
              <p style="font-size: 13px; color: #94a3b8; max-width: 440px; margin: 0; line-height: 1.5;">
                Click <strong>"+ New Scene"</strong> to check which apps you want (for example, Chrome on the Left Half and Antigravity on the Right Half) and assign a 3-finger or 4-finger gesture.
              </p>
              <button type="button" class="btn btn-gold" (click)="openSaveModal()">
                + Create Your First Scene
              </button>
            </div>

            <!-- Saved Scene Cards -->
            <div *ngFor="let scene of store.scenes()" class="scene-card">
              <div class="scene-card-top">
                <div style="min-width: 0; flex: 1;">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span style="font-size: 16px; font-weight: 700; color: #ffffff;">
                      {{ scene.name }}
                    </span>
                    <span *ngIf="scene.gestureFingers" class="scene-badge-gesture">
                      🖐️ {{ scene.gestureFingers }}-Finger Gesture
                    </span>
                    <span *ngIf="!scene.gestureFingers" class="scene-badge-none">
                      Button Only
                    </span>
                  </div>

                  <!-- Clear App + Position Pills -->
                  <div class="scene-app-pill-list">
                    <div *ngFor="let win of scene.windows" class="scene-app-pill">
                      <strong style="color: #f5c451;">{{ win.processName }}</strong>
                      <span style="color: #64748b;">→</span>
                      <span style="color: #ffffff; font-weight: 600;">
                        {{ describeWindowZone(win.rect, win.state) }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Mini Screen Map -->
                <div class="scene-minimap">
                  <div
                    *ngFor="let win of scene.windows; let i = index"
                    class="screen-preview-window"
                    [ngClass]="'win-color-' + (i % 4)"
                    [style.left.%]="win.rect.x * 100"
                    [style.top.%]="win.rect.y * 100"
                    [style.width.%]="win.rect.w * 100"
                    [style.height.%]="win.rect.h * 100">
                    <span style="font-size: 9px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
                      {{ win.processName }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Card Footer Actions -->
              <div class="scene-card-actions">
                <div class="flex items-center gap-2">
                  <button type="button" class="btn btn-secondary" (click)="openEditModal(scene)">
                    ✎ Edit Apps &amp; Layout
                  </button>
                  <button type="button" class="btn btn-danger" (click)="store.deleteScene(scene.id)">
                    Delete
                  </button>
                </div>

                <button type="button" class="btn btn-gold" (click)="testSceneNow(scene)">
                  ▶ Run Scene Now
                </button>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="scenes-footer">
            <span style="font-size: 12px; color: #94a3b8;">
              Tip: Raise 3 or 4 fingers steady in front of the camera to trigger your scene anytime.
            </span>
            <button type="button" class="btn btn-secondary" (click)="store.toggleScenesDrawer(false)">
              Close
            </button>
          </div>
        </ng-container>

        <!-- ======================= VIEW 2: SCENE BUILDER / EDITOR ======================= -->
        <ng-container *ngIf="isModalOpen()">
          <!-- Header -->
          <div class="scenes-header">
            <div>
              <h2 id="scenes-panel-title" class="scenes-title">
                {{ editingSceneId() ? 'Edit Scene Layout' : 'Create New Scene' }}
              </h2>
              <p class="scenes-subtitle">
                1. Name your scene · 2. Pick a hand gesture · 3. Check your apps &amp; pick Left / Right / Full
              </p>
            </div>
            <button type="button" class="btn-close" (click)="closeModal()" aria-label="Close editor">
              ✕
            </button>
          </div>

          <!-- Scrollable Builder Body -->
          <div class="scenes-body">
            <!-- Step 1 & Step 2 Row -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px;">
              <!-- Step 1 -->
              <div class="step-box">
                <label for="scene-name-input" class="step-label">Step 1 · Scene Name</label>
                <input
                  id="scene-name-input"
                  type="text"
                  maxlength="60"
                  [(ngModel)]="modalName"
                  placeholder="e.g. Chrome + Antigravity Split"
                  class="text-input" />
              </div>

              <!-- Step 2 -->
              <div class="step-box">
                <span class="step-label">Step 2 · Hand Gesture Shortcut</span>
                <div class="gesture-choice-grid">
                  <button
                    type="button"
                    class="gesture-choice-btn"
                    [class.active]="modalGesture === 3"
                    [disabled]="isGestureTaken(3)"
                    (click)="!isGestureTaken(3) && (modalGesture = 3)">
                    <span>🖐️ 3 Fingers</span>
                    <span style="font-size: 10px; font-weight: 400; opacity: 0.8;">
                      {{ isGestureTaken(3) ? 'Already used' : 'Index+Mid+Ring' }}
                    </span>
                  </button>

                  <button
                    type="button"
                    class="gesture-choice-btn"
                    [class.active]="modalGesture === 4"
                    [disabled]="isGestureTaken(4)"
                    (click)="!isGestureTaken(4) && (modalGesture = 4)">
                    <span>🖐️ 4 Fingers</span>
                    <span style="font-size: 10px; font-weight: 400; opacity: 0.8;">
                      {{ isGestureTaken(4) ? 'Already used' : 'Thumb tucked' }}
                    </span>
                  </button>

                  <button
                    type="button"
                    class="gesture-choice-btn"
                    [class.active]="modalGesture === null"
                    (click)="modalGesture = null">
                    <span>Button Only</span>
                    <span style="font-size: 10px; font-weight: 400; opacity: 0.8;">No gesture</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Live Screen Layout Preview -->
            <div class="step-box">
              <div class="flex items-center justify-between">
                <span class="step-label">
                  Live Screen Preview ({{ selectedAppCount() }} {{ selectedAppCount() === 1 ? 'app' : 'apps' }} selected)
                </span>
                <span style="font-size: 11px; color: #94a3b8;">
                  Shows exactly how your screen will be arranged
                </span>
              </div>

              <div class="screen-preview-frame">
                <div
                  *ngIf="selectedApps().length === 0"
                  style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #64748b;">
                  Check one or more apps in Step 3 below to see them on screen
                </div>

                <div
                  *ngFor="let item of selectedApps(); let i = index"
                  class="screen-preview-window"
                  [ngClass]="'win-color-' + (i % 4)"
                  [style.left.%]="item.targetRect.x * 100"
                  [style.top.%]="item.targetRect.y * 100"
                  [style.width.%]="item.targetRect.w * 100"
                  [style.height.%]="item.targetRect.h * 100">
                  <span style="font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
                    {{ item.processName }}
                  </span>
                  <span style="font-size: 10px; opacity: 0.9;">
                    {{ getPresetShortLabel(item.presetId) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Step 3: App List & Position Selector -->
            <div class="step-box">
              <div class="flex items-center justify-between flex-wrap gap-2">
                <span class="step-label">
                  Step 3 · Check Apps &amp; Choose Where Each App Goes
                </span>

                <div class="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    style="padding: 5px 10px; font-size: 11px;"
                    (click)="addPresetApp('Notepad', 'notepad.exe', 'Notepad')">
                    + Notepad
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary"
                    style="padding: 5px 10px; font-size: 11px;"
                    (click)="addPresetApp('CalculatorApp', 'calc.exe', 'Calculator')">
                    + Calculator
                  </button>
                  <button
                    type="button"
                    class="btn btn-secondary"
                    style="padding: 5px 10px; font-size: 11px; color: #f5c451; border-color: rgba(245,196,81,0.4);"
                    (click)="refreshOpenApps()">
                    ↻ Refresh Open Windows
                  </button>
                </div>
              </div>

              <div *ngIf="configurableApps().length === 0" class="scenes-empty" style="padding: 20px;">
                <span style="font-size: 12px; color: #94a3b8;">
                  No open desktop windows detected. Open an app and click <strong>Refresh Open Windows</strong>.
                </span>
              </div>

              <div *ngFor="let app of configurableApps(); let idx = index" class="app-row" [class.selected]="app.selected">
                <!-- Left: Checkbox + App Name & Window Title -->
                <label class="app-row-left">
                  <input
                    type="checkbox"
                    class="app-checkbox"
                    [checked]="app.selected"
                    (change)="toggleAppSelection(idx)" />
                  <div style="min-width: 0;">
                    <div class="flex items-center gap-2">
                      <span class="app-name">{{ app.processName }}</span>
                      <span
                        *ngIf="app.selected"
                        style="font-size: 11px; font-weight: 700; color: #f5c451;">
                        → {{ getPresetShortLabel(app.presetId) }}
                      </span>
                    </div>
                    <div class="app-title" [title]="app.title">{{ app.title }}</div>
                  </div>
                </label>

                <!-- Right: One-Click Position Buttons -->
                <div class="app-row-right">
                  <button
                    type="button"
                    class="zone-btn"
                    [class.active]="app.selected && app.presetId === 'left'"
                    (click)="setAppPreset(idx, 'left')">
                    ◧ Left Half
                  </button>

                  <button
                    type="button"
                    class="zone-btn"
                    [class.active]="app.selected && app.presetId === 'right'"
                    (click)="setAppPreset(idx, 'right')">
                    ◨ Right Half
                  </button>

                  <button
                    type="button"
                    class="zone-btn"
                    [class.active]="app.selected && app.presetId === 'maximized'"
                    (click)="setAppPreset(idx, 'maximized')">
                    ⬜ Full Screen
                  </button>

                  <select
                    class="zone-select"
                    [ngModel]="app.presetId"
                    (ngModelChange)="setAppPreset(idx, $event)"
                    aria-label="More screen positions">
                    <option *ngFor="let preset of placementPresets" [value]="preset.id">
                      {{ preset.label }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <!-- Sticky Editor Footer -->
          <div class="scenes-footer">
            <span style="font-size: 12px; color: #cbd5e1;">
              {{
                selectedAppCount() === 0
                  ? 'Please check at least 1 app above to save.'
                  : selectedAppCount() + ' app(s) selected for this scene.'
              }}
            </span>

            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-secondary" (click)="closeModal()">
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                style="border-color: #f5c451; color: #f5c451;"
                [disabled]="selectedAppCount() === 0"
                (click)="saveModal(false)">
                Save Scene
              </button>
              <button
                type="button"
                class="btn btn-gold"
                [disabled]="selectedAppCount() === 0"
                (click)="saveModal(true)">
                ▶ Save &amp; Test Layout Now
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

  private initializeAppsFromOpenCandidates(candidates: OpenWindowCandidate[]): void {
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
