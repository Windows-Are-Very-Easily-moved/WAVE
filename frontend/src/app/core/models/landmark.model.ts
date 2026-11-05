export interface Point2D {
  x: number;
  y: number;
}

export interface Landmark3D {
  x: number;
  y: number;
  z: number;
}

export type HandLandmarks = Landmark3D[];

export interface HandTrackingFrame {
  hands: HandLandmarks[];
  timestampMs: number;
  fps: number;
}

