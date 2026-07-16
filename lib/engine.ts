import type { TrackedObject, MotionResult, Pose } from "./types";
import { DwellMap } from "./dwell";

/**
 * Hot-path state shared between the detection loop and the render surfaces
 * (live canvas, pest map, 3D view). Lives outside React/zustand so per-frame
 * updates never trigger re-renders — render loops read `engine` directly on
 * each rAF tick. Low-frequency snapshots go through the store instead.
 */
export interface EngineState {
  video: HTMLVideoElement | null;
  objects: TrackedObject[];
  motion: MotionResult | null;
  poses: Pose[];
  /** Persistent accumulator of where activity dwells + where it enters. */
  dwell: DwellMap;
  ts: number;
  fps: number;
  inferenceMs: number;
  videoW: number;
  videoH: number;
  /** Live occupancy count per watch-zone id, for overlay labels. */
  zoneOcc: Record<number, number>;
}

export const engine: EngineState = {
  video: null,
  objects: [],
  motion: null,
  poses: [],
  dwell: new DwellMap(),
  ts: 0,
  fps: 0,
  inferenceMs: 0,
  videoW: 0,
  videoH: 0,
  zoneOcc: {},
};
