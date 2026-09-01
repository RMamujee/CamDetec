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

export type EventKind = "enter" | "exit" | "pest" | "motion" | "ingress" | "zone" | "system";

/** A user-drawn watch zone in normalized, un-mirrored video coords (0..1). */
export interface Zone {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EventRecord {
  id: string;
  t: number;
  kind: EventKind;
  class?: string;
  message: string;
  trackId?: number;
  /**
   * Marked by hand as a false positive. Absent on every event logged before the
   * feature — and on every event nobody has judged — which readers treat as
   * "not flagged". Feeds the retrain export.
   */
  flagged?: boolean;
}

/** How the inference input is brightened: never applied to stored snapshots. */
export type LowLightMode = "auto" | "on" | "off";

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
  /** Whether the last inference input was brightened, and the luma that decided it. */
  lowLightActive: boolean;
  luma: number | null;
  /** Consecutive failed `detect()` calls, and the last reason. Zero once a frame lands. */
  detectorErrors: number;
  detectorError: string | null;
  /** Screen wake lock: held / not held, or null when unsupported or the camera is off. */
  wakeLock: boolean | null;
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
  lowLight: LowLightMode;

  /* Alerts. Detections a track must accumulate before it is confirmed — which
     gates its on-screen box and zone counts as well as its event and alert. */
  alertMinFrames: number;
  /** Seconds each channel stays quiet after firing. */
  alertCooldownSec: number;
  notifyEnabled: boolean;
  webhookEnabled: boolean;
  webhookKind: "discord" | "telegram";
  /** Stored in localStorage on this device only — never leaves the browser. */
  discordUrl: string;
  telegramToken: string;
  telegramChatId: string;

  /** Capture a JPEG of the frame behind each confirmed pest event. */
  snapshotsEnabled: boolean;

  /** Hold a screen wake lock while the camera is live (dedicated-device mode). */
  wakeLockEnabled: boolean;
}
