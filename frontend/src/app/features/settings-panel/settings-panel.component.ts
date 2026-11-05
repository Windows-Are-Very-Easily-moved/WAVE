import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../core/services/settings.service';
import { FilterType } from '../../core/models/gesture.model';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-card glass-panel">
      <div class="panel-header">
        <div>
          <h3>Spatial Calibration</h3>
          <p class="subtitle">Live-tunable thresholds &bull; Persisted to localStorage</p>
        </div>
        <button type="button" class="btn-reset" (click)="resetDefaults()">
          Reset Defaults
        </button>
      </div>

      <div class="settings-grid">
        <!-- Smoothing Filter Type -->
        <div class="control-row">
          <div class="label-group">
            <label>Cursor Smoothing Filter</label>
            <span class="badge">{{ s().filterType === 'lerp' ? 'Linear Lerp' : '1€ Adaptive' }}</span>
          </div>
          <div class="segmented-control">
            <button
              type="button"
              [class.active]="s().filterType === 'lerp'"
              (click)="setFilter('lerp')">
              Lerp (Standard)
            </button>
            <button
              type="button"
              [class.active]="s().filterType === 'oneEuro'"
              (click)="setFilter('oneEuro')">
              One Euro (1€)
            </button>
          </div>
        </div>

        <!-- Lerp Alpha -->
        <div class="control-row">
          <div class="label-group">
            <label>Lerp Smoothing Alpha</label>
            <span class="value-chip">{{ s().lerpAlpha | number:'1.2-2' }}</span>
          </div>
          <input
            type="range"
            min="0.10"
            max="0.90"
            step="0.05"
            [ngModel]="s().lerpAlpha"
            (ngModelChange)="settingsService.update('lerpAlpha', +$event)" />
          <small class="hint">Lower = smoother cursor, higher = lower latency (default 0.35)</small>
        </div>

        <!-- Pinch Enter Threshold -->
        <div class="control-row">
          <div class="label-group">
            <label>Pinch Enter Threshold (Normalized)</label>
            <span class="value-chip">{{ s().pinchEnterThreshold | number:'1.2-2' }}</span>
          </div>
          <input
            type="range"
            min="0.15"
            max="0.45"
            step="0.01"
            [ngModel]="s().pinchEnterThreshold"
            (ngModelChange)="settingsService.update('pinchEnterThreshold', +$event)" />
          <small class="hint">Normalized by hand size (~0.055 raw units at arm's length)</small>
        </div>

        <!-- Pinch Exit Hysteresis Multiplier -->
        <div class="control-row">
          <div class="label-group">
            <label>Hysteresis Exit Multiplier</label>
            <span class="value-chip">{{ s().pinchExitMultiplier | number:'1.1-2' }}x</span>
          </div>
          <input
            type="range"
            min="1.15"
            max="2.00"
            step="0.05"
            [ngModel]="s().pinchExitMultiplier"
            (ngModelChange)="settingsService.update('pinchExitMultiplier', +$event)" />
          <small class="hint">Exit threshold = Enter &times; Multiplier (eliminates pinch flicker)</small>
        </div>

        <!-- Edge Zone Size -->
        <div class="control-row">
          <div class="label-group">
            <label>Edge Snap Zone Width</label>
            <span class="value-chip">{{ (s().edgeZoneSize * 100) | number:'1.0-0' }}%</span>
          </div>
          <input
            type="range"
            min="0.12"
            max="0.32"
            step="0.01"
            [ngModel]="s().edgeZoneSize"
            (ngModelChange)="settingsService.update('edgeZoneSize', +$event)" />
        </div>

        <!-- Dwell Time -->
        <div class="control-row">
          <div class="label-group">
            <label>Zone Arm Dwell Time</label>
            <span class="value-chip">{{ s().dwellTimeMs }} ms</span>
          </div>
          <input
            type="range"
            min="50"
            max="500"
            step="25"
            [ngModel]="s().dwellTimeMs"
            (ngModelChange)="settingsService.update('dwellTimeMs', +$event)" />
        </div>

        <!-- Snap Cooldown -->
        <div class="control-row">
          <div class="label-group">
            <label>Snap Release Cooldown</label>
            <span class="value-chip">{{ s().cooldownMs }} ms</span>
          </div>
          <input
            type="range"
            min="250"
            max="1800"
            step="50"
            [ngModel]="s().cooldownMs"
            (ngModelChange)="settingsService.update('cooldownMs', +$event)" />
        </div>

        <!-- Split Ratio -->
        <div class="control-row">
          <div class="label-group">
            <label>Left / Right Snap Split Ratio</label>
            <span class="value-chip">{{ (s().snapRatio * 100) | number:'1.0-0' }}%</span>
          </div>
          <input
            type="range"
            min="0.30"
            max="0.70"
            step="0.05"
            [ngModel]="s().snapRatio"
            (ngModelChange)="settingsService.update('snapRatio', +$event)" />
        </div>

        <!-- Feature Toggles -->
        <div class="toggles-row">
          <label class="checkbox-pill">
            <input
              type="checkbox"
              [ngModel]="s().enableCorners"
              (ngModelChange)="settingsService.update('enableCorners', !!$event)" />
            <span>4-Corner Quarter Snaps</span>
          </label>
          <label class="checkbox-pill">
            <input
              type="checkbox"
              [ngModel]="s().enableThrowGesture"
              (ngModelChange)="settingsService.update('enableThrowGesture', !!$event)" />
            <span>Throw Flick (Next Monitor)</span>
          </label>
          <label class="checkbox-pill">
            <input
              type="checkbox"
              [ngModel]="s().enableTwoHandResize"
              (ngModelChange)="settingsService.update('enableTwoHandResize', !!$event)" />
            <span>2-Hand Pinch Resize</span>
          </label>
          <label class="checkbox-pill">
            <input
              type="checkbox"
              [ngModel]="s().enableWaveCycleGesture"
              (ngModelChange)="settingsService.update('enableWaveCycleGesture', !!$event)" />
            <span>Wave Cycle (Alt+Tab)</span>
          </label>
          <label class="checkbox-pill">
            <input
              type="checkbox"
              [ngModel]="s().enableLiveDrag"
              (ngModelChange)="settingsService.update('enableLiveDrag', !!$event)" />
            <span>Live Spatial Dragging</span>
          </label>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-card {
      padding: 1rem 1.15rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(245, 185, 66, 0.16);
      padding-bottom: 0.65rem;
    }
    h3 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: 0.02em;
    }
    .subtitle {
      margin: 0.15rem 0 0;
      font-size: 0.72rem;
      color: #94a3b8;
    }
    .btn-reset {
      background: rgba(245, 185, 66, 0.12);
      color: #f5b942;
      border: 1px solid rgba(245, 185, 66, 0.35);
      border-radius: 8px;
      padding: 0.35rem 0.7rem;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .btn-reset:hover {
      background: rgba(245, 185, 66, 0.24);
      box-shadow: 0 0 12px rgba(245, 185, 66, 0.25);
    }
    .settings-grid {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .control-row {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .label-group {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.78rem;
      color: #e2e8f0;
      font-weight: 500;
    }
    .value-chip, .badge {
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 0.72rem;
      color: #f5b942;
      background: rgba(245, 185, 66, 0.12);
      border: 1px solid rgba(245, 185, 66, 0.25);
      padding: 0.1rem 0.45rem;
      border-radius: 6px;
    }
    input[type='range'] {
      width: 100%;
      accent-color: #f5b942;
      cursor: pointer;
      height: 5px;
    }
    .hint {
      font-size: 0.68rem;
      color: #64748b;
    }
    .segmented-control {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
      background: rgba(15, 23, 42, 0.65);
      padding: 0.25rem;
      border-radius: 8px;
      border: 1px solid rgba(148, 163, 184, 0.15);
    }
    .segmented-control button {
      background: transparent;
      color: #94a3b8;
      border: none;
      padding: 0.35rem 0.5rem;
      border-radius: 6px;
      font-size: 0.74rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .segmented-control button.active {
      background: rgba(245, 185, 66, 0.2);
      color: #ffe39f;
      border: 1px solid rgba(245, 185, 66, 0.4);
    }
    .toggles-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      padding-top: 0.3rem;
    }
    .checkbox-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.74rem;
      color: #cbd5e1;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.2);
      padding: 0.3rem 0.6rem;
      border-radius: 999px;
      cursor: pointer;
      user-select: none;
    }
    .checkbox-pill input {
      accent-color: #f5b942;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPanelComponent {
  readonly settingsService = inject(SettingsService);
  readonly s = this.settingsService.settings;

  setFilter(type: FilterType): void {
    this.settingsService.update('filterType', type);
  }

  resetDefaults(): void {
    this.settingsService.resetToDefaults();
  }
}

