import type { RawDetection } from "./types";

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
  detect(input: HTMLVideoElement, maxDetections: number): Promise<RawDetection[]>;
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

  async detect(input: HTMLVideoElement, maxDetections: number): Promise<RawDetection[]> {
    if (!this.model) return [];
    const preds = await this.model.detect(input, maxDetections);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return preds.map((p: any) => ({
      bbox: p.bbox as [number, number, number, number],
      class: p.class as string,
      score: p.score as number,
    }));
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
    onProgress?.("model ready");
  }

  async detect(input: HTMLVideoElement, maxDetections: number): Promise<RawDetection[]> {
    if (!this.model || !this.tf) return [];
    const tf = this.tf;
    const imgsz = this.imgsz;
    const nc = this.labels.length;
    const vw = input.videoWidth;
    const vh = input.videoHeight;
    if (!vw || !vh) return [];

    const input4d = tf.tidy(() =>
      tf.browser.fromPixels(input).resizeBilinear([imgsz, imgsz]).div(255).expandDims(0),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let output: any;
    try {
      output = await this.model.executeAsync(input4d);
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
      out.push({
        bbox: [x1 * sx, y1 * sy, (x2 - x1) * sx, (y2 - y1) * sy],
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
