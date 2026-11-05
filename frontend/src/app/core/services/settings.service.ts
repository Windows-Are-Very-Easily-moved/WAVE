import { Injectable, signal } from '@angular/core';
import { DEFAULT_SETTINGS, ScepterSettings } from '../models/gesture.model';

const STORAGE_KEY = 'scepter.settings.v1';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings = signal<ScepterSettings>(this.loadFromStorage());

  update<K extends keyof ScepterSettings>(key: K, value: ScepterSettings[K]): void {
    const next = { ...this.settings(), [key]: value };
    this.settings.set(next);
    this.saveToStorage(next);
  }

  resetToDefaults(): void {
    const defaults = { ...DEFAULT_SETTINGS };
    this.settings.set(defaults);
    this.saveToStorage(defaults);
  }

  private loadFromStorage(): ScepterSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<ScepterSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveToStorage(settings: ScepterSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage quota errors
    }
  }
}

