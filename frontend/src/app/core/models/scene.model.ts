export interface WindowFractionalRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SceneWindowState = 'normal' | 'maximized' | 'minimized';

export interface SceneWindowSummary {
  processName: string;
  rect: WindowFractionalRect;
  state: SceneWindowState;
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
}

export interface UpdateScenePayload {
  name?: string;
  gestureFingers?: 3 | 4 | null;
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
