export type SnapPosition =
  | 'left'
  | 'right'
  | 'top'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'nextMonitor';

export interface GrabPayload {
  x: number;
  y: number;
}

export interface MovePayload {
  x: number;
  y: number;
  deltaX?: number;
  deltaY?: number;
}

export interface SnapPayload {
  position: SnapPosition;
  ratio: number;
}

export interface ResizePayload {
  scaleFactor: number;
}

export interface CyclePayload {
  direction: 'next' | 'prev';
  handle?: number;
}

export interface RectDto {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SnapResult {
  success: boolean;
  windowTitle: string;
  appliedRect: RectDto | null;
  message: string;
  processName?: string;
  handle?: number;
}

export interface ActiveWindowInfo {
  handle: number;
  title: string;
  processName: string;
  className: string;
  bounds: RectDto | null;
  isLockedTarget: boolean;
}

