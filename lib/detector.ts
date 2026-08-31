import type { LowLightMode, RawDetection } from "./types";
import { boostLowLight, canvasLuma, decideLowLight, tensorLuma } from "./lowlight";

/**
 * A swappable object detector. The whole app talks to this interface and never
 * to a concrete model — the seam that lets a purpose-built pest model drop in
 * without touching the tracker, motion detector, dwell map, or UI.
 */
export interface Detector {
  readonly id: string;
  readonly label: string;
  readonly vocabulary: string;
  load(onProgress?: (msg: string) => void): Promise<void>;
  /** `lowLight` brightens the inference input only; stored frames stay raw. */
  detect(
    input: HTMLVideoElement,
    maxDetections: number,
    lowLight?: LowLightMode,
  ): Promise<RawDetection[]>;
  backend(): string;
  dispose(): void;
}

/** COCO-SSD (TensorFlow.js) — general 80-class detector, runs fully in-browser. */
export class CocoSsdDetector implements Detector {
  readonly id = "coco-ssd";
  readonly label = "COCO-SSD (MobileNet v2)";
  readonly vocabulary = "80 general classes · person, bird, cat, dog, car …";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tf: any = null;

  async load(onProgress?: (msg: string) => void): Promise<void> {
    onProgress?.("loading tensorflow runtime");
    const tf = await import("@tensorflow/tfjs");
    this.tf = tf;
    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();
    onProgress?.(`backend ${tf.getBackend()}`);
    onProgress?.("loading coco-ssd weights");
    const cocoSsd = await import("@tensorflow-models/coco-ssd");
    this.model = await cocoSsd.load({ base: "mobilenet_v2" });
    onProgress?.("model ready");
  }

  async detect(
    input: HTMLVideoElement,
    maxDetections: number,
    lowLight: LowLightMode = "off",
  ): Promise<RawDetection[]> {
    if (!this.model) return [];
    const tf = this.tf;
    // This model takes the video element directly, so luma comes from a small
    // canvas sample and a boosted frame is only materialised when it's needed.
    const luma = lowLight === "off" || !tf ? null : canvasLuma(input);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let boosted: any = null;
    if (decideLowLight(lowLight, luma) && tf) {
      boosted = tf.tidy(() =>
        boostLowLight(tf.browser.fromPixels(input).toFloat().div(255)).mul(255).cast("int32"),
      );
    }
    try {
      const preds = await this.model.detect(boosted ?? input, maxDetections);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return preds.map((p: any) => ({
        bbox: p.bbox as [number, number, number, number],
        class: p.class as string,
        score: p.score as number,
      }));
    } finally {
      boosted?.dispose();
    }
  }

  backend(): string {
    return this.tf?.getBackend?.() ?? "unknown";
  }

  dispose(): void {
    this.model?.dispose?.();
    this.model = null;
  }
}

/**
 * Loader for a custom pest model trained with Ultralytics YOLOv8 and exported
 * to TF.js (`yolo export format=tfjs`, see `training/`). Decodes the raw YOLOv8
 * head output ([1, 4+nc, 8400]: cx,cy,w,h in input pixels + per-class scores)
 * and runs NMS in-browser. Install the converted model at
 * `public/models/pest/` — `load()` throws clearly if it isn't there and the app
 * falls back to COCO-SSD.
 */
export class YoloTfjsDetector implements Detector {
  readonly id = "pest";
  readonly label = "Pest model (YOLOv8)";
  readonly vocabulary = "custom pest classes · rodents, cockroach, raccoon …";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private model: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tf: any = null;
  private labels: string[] = [];
  private readonly imgsz = 640; // must match the export imgsz

  constructor(
    private readonly modelUrl = "/models/pest/model.json",
    private readonly labelsUrl = "/models/pest/labels.json",
  ) {}

  async load(onProgress?: (msg: string) => void): Promise<void> {
    onProgress?.("loading tensorflow runtime");
    const tf = await import("@tensorflow/tfjs");
    this.tf = tf;
    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();
    onProgress?.("loading pest labels");
    const res = await fetch(this.labelsUrl);
    if (!res.ok) throw new Error("pest model not installed — see training/ to build it");
    this.labels = await res.json();
    onProgress?.("loading pest weights");
    this.model = await tf.loadGraphModel(this.modelUrl);
    // Warm up on a blank frame: the first inference compiles every WebGL shader
    // the graph needs (~5s), and paying that here keeps it out of the live loop.
    onProgress?.("warming up");
    const warm = tf.tidy(() => this.model.execute(tf.zeros([1, this.imgsz, this.imgsz, 3])));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Array.isArray(warm) ? warm : [warm]).forEach((t: any) => t.dispose?.());
    onProgress?.("model ready");
  }

  async detect(
    input: HTMLVideoElement,
    maxDetections: number,
    lowLight: LowLightMode = "off",
  ): Promise<RawDetection[]> {
    if (!this.model || !this.tf) return [];
    const tf = this.tf;
    const imgsz = this.imgsz;
    const nc = this.labels.length;
    const vw = input.videoWidth;
    const vh = input.videoHeight;
    if (!vw || !vh) return [];

    const input4d = tf.tidy(() => {
      const x = tf.browser.fromPixels(input).resizeBilinear([imgsz, imgsz]).div(255).expandDims(0);
      // Luma is read off the already-downscaled tensor — no extra frame copy.
      const luma = lowLight === "off" ? null : tensorLuma(tf, x);
      return decideLowLight(lowLight, luma) ? boostLowLight(x) : x;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let output: any;
    try {
      // The exported graph has no control flow or dynamic shapes, so the
      // synchronous path applies (tfjs itself logs a hint to that effect).
      output = this.model.execute(input4d);
    } finally {
      input4d.dispose();
    }
    const outT = Array.isArray(output) ? output[0] : output;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decoded = tf.tidy(() => {
      let t = outT.squeeze(); // [4+nc, N] or [N, 4+nc]
      if (t.shape[0] === 4 + nc) t = t.transpose(); // -> [N, 4+nc]
      const boxes = t.slice([0, 0], [-1, 4]); // cx,cy,w,h in imgsz px
      const clsScores = t.slice([0, 4], [-1, nc]);
      const scores = clsScores.max(1);
      const classes = clsScores.argMax(1);
      const [cx, cy, w, h] = tf.split(boxes, 4, 1);
      const y1 = cy.sub(h.div(2));
      const x1 = cx.sub(w.div(2));
      const y2 = cy.add(h.div(2));
      const x2 = cx.add(w.div(2));
      const boxesYX = tf.concat([y1, x1, y2, x2], 1);
      return { boxesYX, scores, classes };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Array.isArray(output) ? output : [output]).forEach((t: any) => t.dispose?.());

    const nms = await tf.image.nonMaxSuppressionAsync(
      decoded.boxesYX,
      decoded.scores,
      maxDetections,
      0.45,
      0.2,
    );
    const selBoxes = tf.gather(decoded.boxesYX, nms);
    const selScores = tf.gather(decoded.scores, nms);
    const selClasses = tf.gather(decoded.classes, nms);
    const boxesArr = (await selBoxes.array()) as number[][];
    const scoresArr = (await selScores.array()) as number[];
    const classesArr = (await selClasses.array()) as number[];
    [decoded.boxesYX, decoded.scores, decoded.classes, nms, selBoxes, selScores, selClasses].forEach(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => t.dispose?.(),
    );

    const sx = vw / imgsz;
    const sy = vh / imgsz;
    const out: RawDetection[] = [];
    for (let k = 0; k < boxesArr.length; k++) {
      const [y1, x1, y2, x2] = boxesArr[k];
      // Clamp to the frame: the head can predict boxes that run past the edges,
      // and everything downstream (tracker IoU, dwell ground point, snapshot
      // annotation) assumes coordinates inside the video.
      const bx = Math.min(Math.max(x1 * sx, 0), vw);
      const by = Math.min(Math.max(y1 * sy, 0), vh);
      const bw = Math.min(Math.max(x2 * sx, 0), vw) - bx;
      const bh = Math.min(Math.max(y2 * sy, 0), vh) - by;
      if (bw <= 0 || bh <= 0) continue;
      out.push({
        bbox: [bx, by, bw, bh],
        class: this.labels[classesArr[k]] ?? `class_${classesArr[k]}`,
        score: scoresArr[k],
      });
    }
    return out;
  }

  backend(): string {
    return this.tf?.getBackend?.() ?? "unknown";
  }

  dispose(): void {
    this.model?.dispose?.();
    this.model = null;
  }
}

export function createDetector(id: string): Detector {
  switch (id) {
    case "pest":
      return new YoloTfjsDetector();
    case "coco-ssd":
    default:
      return new CocoSsdDetector();
  }
}
