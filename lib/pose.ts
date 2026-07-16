import type { Pose } from "./types";

/** COCO 17-keypoint skeleton edges (indices into the keypoint array). */
export const SKELETON_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4], // head
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10], // arms + shoulders
  [5, 11],
  [6, 12],
  [11, 12], // torso
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16], // legs
];

export const KP_MIN_SCORE = 0.3;

/**
 * Body / limb detection via MoveNet MultiPose (TensorFlow.js). Runs alongside
 * the object detector and shares the same WebGL backend. This is the "limb
 * detection" brought back from the original app, now also feeding the 3D
 * stick-figure view.
 */
export class PoseEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private detector: any = null;

  get ready(): boolean {
    return !!this.detector;
  }

  async load(): Promise<void> {
    const tf = await import("@tensorflow/tfjs");
    if (!tf.getBackend()) {
      try {
        await tf.setBackend("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
    }
    const pd = await import("@tensorflow-models/pose-detection");
    this.detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
      modelType: pd.movenet.modelType.MULTIPOSE_LIGHTNING,
      enableTracking: true,
      trackerType: pd.TrackerType.BoundingBox,
    });
  }

  async estimate(video: HTMLVideoElement): Promise<Pose[]> {
    if (!this.detector) return [];
    const raw = await this.detector.estimatePoses(video, {
      flipHorizontal: false,
      maxPoses: 6,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return raw.map((p: any) => ({
      score: p.score ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      keypoints: (p.keypoints ?? []).map((k: any) => ({
        x: k.x,
        y: k.y,
        score: k.score ?? 0,
        name: k.name ?? "",
      })),
    }));
  }

  dispose() {
    this.detector?.dispose?.();
    this.detector = null;
  }
}
