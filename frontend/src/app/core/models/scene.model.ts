export interface WindowFractionalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SceneWindowState = 'normal' | 'maximized' | 'minimized';

export interface OpenWindowCandidate {
  handle: number;
  processName: string;
  className: string;
  title: string;
  executablePath?: string | null;
  monitorDeviceName: string;
  rect: WindowFractionalRect;
  state: SceneWindowState;
  zOrder: number;
}

export interface SelectedSceneWindowInput {
  handle?: number | null;
  processName: string;
  className?: string | null;
  titleHint?: string | null;
  executablePath?: string | null;
  monitorDeviceName?: string | null;
  rect: WindowFractionalRect;
  state?: SceneWindowState;
}

export type ScenePlacementPresetId =
  | 'current'
  | 'left'
  | 'right'
  | 'maximized'
  | 'top'
  | 'bottom'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'center';

export interface ScenePlacementPreset {
  id: ScenePlacementPresetId;
  label: string;
  shortLabel: string;
  rect?: WindowFractionalRect;
  state?: SceneWindowState;
}

export const SCENE_PLACEMENT_PRESETS: readonly ScenePlacementPreset[] = [
  { id: 'left', label: 'Left Half (50%)', shortLabel: 'Left Half', rect: { x: 0, y: 0, w: 0.5, h: 1 }, state: 'normal' },
  { id: 'right', label: 'Right Half (50%)', shortLabel: 'Right Half', rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, state: 'normal' },
  { id: 'maximized', label: 'Full Screen (Maximized)', shortLabel: 'Full Screen', rect: { x: 0, y: 0, w: 1, h: 1 }, state: 'maximized' },
  { id: 'topLeft', label: 'Top-Left Quarter', shortLabel: 'Top-Left', rect: { x: 0, y: 0, w: 0.5, h: 0.5 }, state: 'normal' },
  { id: 'topRight', label: 'Top-Right Quarter', shortLabel: 'Top-Right', rect: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, state: 'normal' },
  { id: 'bottomLeft', label: 'Bottom-Left Quarter', shortLabel: 'Bottom-Left', rect: { x: 0, y: 0.5, w: 0.5, h: 0.5 }, state: 'normal' },
  { id: 'bottomRight', label: 'Bottom-Right Quarter', shortLabel: 'Bottom-Right', rect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, state: 'normal' },
  { id: 'top', label: 'Top Half', shortLabel: 'Top Half', rect: { x: 0, y: 0, w: 1, h: 0.5 }, state: 'normal' },
  { id: 'bottom', label: 'Bottom Half', shortLabel: 'Bottom Half', rect: { x: 0, y: 0.5, w: 1, h: 0.5 }, state: 'normal' },
  { id: 'center', label: 'Centered (70%)', shortLabel: 'Centered', rect: { x: 0.15, y: 0.1, w: 0.7, h: 0.8 }, state: 'normal' },
  { id: 'current', label: 'Keep Current Window Spot', shortLabel: 'Current Spot' }
];

export interface SceneWindowSummary {
  handle?: number | null;
  processName: string;
  rect: WindowFractionalRect;
  state: SceneWindowState;
  titleHint?: string | null;
  executablePath?: string | null;
  className?: string | null;
}

export interface SceneSummary {
  id: string;
  name: string;
  gestureFingers: 3 | 4 | null;
  createdAt: string;
  windowCount: number;
  windows: SceneWindowSummary[];
}

export interface CaptureScenePayload {
  name?: string;
  gestureFingers?: 3 | 4 | null;
  selectedWindows?: SelectedSceneWindowInput[];
}

export interface UpdateScenePayload {
  name?: string;
  gestureFingers?: 3 | 4 | null;
  selectedWindows?: SelectedSceneWindowInput[];
}

export interface RestoredWindowInfo {
  processName: string;
  className: string;
  titleHint?: string;
  rect: WindowFractionalRect;
}

export interface MissingWindowInfo {
  processName: string;
  className: string;
  titleHint?: string;
}

export interface FailedWindowInfo {
  processName: string;
  className: string;
  titleHint?: string;
  reason: string;
}

export interface SceneApplyResult {
  scene: SceneSummary;
  restored: RestoredWindowInfo[];
  missing: MissingWindowInfo[];
  failed: FailedWindowInfo[];
  durationMs: number;
}
