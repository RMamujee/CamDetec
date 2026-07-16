import type { RawDetection, TrackedObject } from "./types";

interface TrackOpts {
  /** EMA factor for bbox/score smoothing (0..1); higher = smoother/slower. */
  smoothing: number;
  /** Frames a track must be seen before it is "confirmed". */
  minHits: number;
  /** Frames a track survives without a match before deletion. */
  maxMissed: number;
  /** IoU below which a detection can't match a track. */
  iouThreshold: number;
  /** Predicate: does this class count as a pest under current settings? */
  isPest: (cls: string) => boolean;
}

const TRAIL_MAX = 24;

function iou(a: TrackedObject["bbox"], b: RawDetection["bbox"]): number {
  const ax2 = a[0] + a[2];
  const ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2];
  const by2 = b[1] + b[3];
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = a[2] * a[3] + b[2] * b[3] - inter;
  return union <= 0 ? 0 : inter / union;
}

function center(b: { bbox: [number, number, number, number] } | RawDetection): [number, number] {
  const bb = (b as RawDetection).bbox;
  return [bb[0] + bb[2] / 2, bb[1] + bb[3] / 2];
}

/**
 * Greedy IoU tracker with exponential smoothing. Turning flickery per-frame
 * detections into stable tracks is the single biggest accuracy/feel win over
 * the previous version of the app: confidence stops jittering, boxes stop
 * popping, and objects keep a consistent identity so we can log enter/exit
 * events and draw motion trails.
 */
export class Tracker {
  private tracks: TrackedObject[] = [];
  private nextId = 1;

  reset() {
    this.tracks = [];
    this.nextId = 1;
  }

  get all(): TrackedObject[] {
    return this.tracks;
  }

  update(
    detections: RawDetection[],
    now: number,
    opts: TrackOpts,
  ): { objects: TrackedObject[]; entered: TrackedObject[]; exited: TrackedObject[] } {
    const { smoothing, minHits, maxMissed, iouThreshold, isPest } = opts;
    const a = smoothing;

    // Build all candidate (track, detection) matches, best IoU first.
    const pairs: Array<{ ti: number; di: number; score: number }> = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      for (let di = 0; di < detections.length; di++) {
        const s = iou(this.tracks[ti].bbox, detections[di].bbox);
        if (s >= iouThreshold) pairs.push({ ti, di, score: s });
      }
    }
    pairs.sort((p, q) => q.score - p.score);

    const trackUsed = new Set<number>();
    const detUsed = new Set<number>();
    const entered: TrackedObject[] = [];

    for (const { ti, di } of pairs) {
      if (trackUsed.has(ti) || detUsed.has(di)) continue;
      trackUsed.add(ti);
      detUsed.add(di);
      const t = this.tracks[ti];
      const d = detections[di];
      const prevCenter = center(t);
      // Smooth bbox and score.
      for (let k = 0; k < 4; k++) t.bbox[k] = t.bbox[k] * a + d.bbox[k] * (1 - a);
      t.score = t.score * a + d.score * (1 - a);
      t.class = d.class;
      t.age++;
      t.missed = 0;
      t.lastSeen = now;
      t.isPest = isPest(d.class);
      const c = center(t);
      t.velocity = [c[0] - prevCenter[0], c[1] - prevCenter[1]];
      t.trail.push(c);
      if (t.trail.length > TRAIL_MAX) t.trail.shift();
      const wasConfirmed = t.confirmed;
      if (!t.confirmed && t.age >= minHits) {
        t.confirmed = true;
        if (!wasConfirmed) entered.push(t);
      }
    }

    // Unmatched detections spawn new tracks.
    for (let di = 0; di < detections.length; di++) {
      if (detUsed.has(di)) continue;
      const d = detections[di];
      const c = center(d);
      const track: TrackedObject = {
        id: this.nextId++,
        class: d.class,
        score: d.score,
        bbox: [...d.bbox] as [number, number, number, number],
        velocity: [0, 0],
        age: 1,
        missed: 0,
        confirmed: minHits <= 1,
        firstSeen: now,
        lastSeen: now,
        isPest: isPest(d.class),
        trail: [c],
      };
      this.tracks.push(track);
      if (track.confirmed) entered.push(track);
    }

    // Age out unmatched tracks; coast them along their velocity.
    const exited: TrackedObject[] = [];
    const survivors: TrackedObject[] = [];
    for (let ti = 0; ti < this.tracks.length; ti++) {
      const t = this.tracks[ti];
      if (!trackUsed.has(ti) && t.age > 0 && t.lastSeen !== now) {
        t.missed++;
        t.bbox[0] += t.velocity[0];
        t.bbox[1] += t.velocity[1];
      }
      if (t.missed > maxMissed) {
        if (t.confirmed) exited.push(t);
      } else {
        survivors.push(t);
      }
    }
    this.tracks = survivors;

    const objects = this.tracks.filter((t) => t.confirmed);
    return { objects, entered, exited };
  }
}
