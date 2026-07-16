// Shared type definitions for the CamDetec detection engine and UI.

export interface RawDetection {
  /** [x, y, width, height] in video pixels (origin top-left). */
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export interface TrackedObject {
  id: number;
  class: string;
  score: number;
  bbox: [number, number, number, number];
  velocity: [number, number];
  age: number;
  missed: number;
  confirmed: boolean;
  firstSeen: number;
  lastSeen: number;
  isPest: boolean;
  trail: Array<[number, number]>;
}

export interface MotionRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  intensity: number;
}

export interface MotionResult {
  level: number;
  grid: Float32Array;
  gridW: number;
  gridH: number;
  regions: MotionRegion[];
}

/** A single body keypoint from the pose model, in video pixels. */
export interface Keypoint {
  x: number;
  y: number;
  score: number;
  name: string;
}

/** One detected body (COCO 17-keypoint layout). */
export interface Pose {
  keypoints: Keypoint[];
  score: number;
}

export type EventKind = "enter" | "exit" | "pest" | "motion" | "ingress" | "system";

export interface EventRecord {
  id: string;
  t: number;
  kind: EventKind;
  class?: string;
  message: string;
  trackId?: number;
}

export interface Diagnostics {
  fps: number;
  inferenceMs: number;
  backend: string;
  model: string;
  resolution: string;
  heapMB: number | null;
  battery: number | null;
  charging: boolean | null;
  rttMs: number | null;
  posesActive: number;
}

export interface ActivityBucket {
  t: number;
  count: number;
  pest: number;
}

export type TrapKind = "hotspot" | "ingress";

/** A trap / countermeasure placement recommendation. */
export interface TrapSuggestion {
  id: string;
  kind: TrapKind;
  priority: "high" | "medium" | "low";
  confidence: number;
  /** Normalized frame location 0..1. */
  x: number;
  y: number;
  title: string;
  detail: string;
  metric: string;
}

export type TabId = "live" | "pestmap" | "spatial" | "events" | "diagnostics" | "settings";

export type CameraStatus = "idle" | "requesting" | "live" | "denied" | "error";
export type ModelStatus = "idle" | "loading" | "ready" | "error";

export interface OverlayFlags {
  boxes: boolean;
  labels: boolean;
  ids: boolean;
  confidence: boolean;
  motionHeat: boolean;
  trails: boolean;
  reticles: boolean;
  skeleton: boolean;
}

export interface Settings {
  detectorId: "coco-ssd" | "pest";
  confidence: number;
  motionSensitivity: number;
  targetFps: number;
  pestMode: boolean;
  pestClasses: string[];
  poseEnabled: boolean;
  mirror: boolean;
  deviceId: string | null;
  maxDetections: number;
  smoothing: number;
}
