import type { TrapSuggestion } from "./types";

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The pest-control intelligence layer. Two accumulating grids over the frame:
 *  - `grid`    — how much time activity spends in each cell (loiter / dwell)
 *  - `ingress` — where tracks first appear and disappear (entry / exit points)
 * Together they answer the operational questions: where do pests come in, and
 * where do they hang around — i.e. where should traps go.
 */
export class DwellMap {
  readonly w = 48;
  readonly h = 36;
  grid = new Float32Array(this.w * this.h);
  ingress = new Float32Array(this.w * this.h);
  maxDwell = 0.001;
  maxIngress = 0.001;

  reset() {
    this.grid.fill(0);
    this.ingress.fill(0);
    this.maxDwell = 0.001;
    this.maxIngress = 0.001;
  }

  private idx(nx: number, ny: number): number {
    const gx = clamp(Math.floor(nx * this.w), 0, this.w - 1);
    const gy = clamp(Math.floor(ny * this.h), 0, this.h - 1);
    return gy * this.w + gx;
  }

  /** Add `dt` seconds of presence (weighted) at a normalized ground point. */
  accumulate(nx: number, ny: number, dt: number, weight: number) {
    const i = this.idx(nx, ny);
    this.grid[i] += dt * weight;
    if (this.grid[i] > this.maxDwell) this.maxDwell = this.grid[i];
  }

  /** Record an entry/exit crossing at a normalized point. */
  markIngress(nx: number, ny: number, weight = 1) {
    const i = this.idx(nx, ny);
    this.ingress[i] += weight;
    if (this.ingress[i] > this.maxIngress) this.maxIngress = this.ingress[i];
  }
}

function locationWord(nx: number, ny: number): string {
  const v = ny < 0.34 ? "upper" : ny > 0.66 ? "lower" : "middle";
  const h = nx < 0.34 ? "left" : nx > 0.66 ? "right" : "center";
  if (v === "middle" && h === "center") return "center of frame";
  return `${v} ${h}`;
}

/** Greedy non-maximum suppression over a grid → strongest well-separated cells. */
function peaks(
  data: Float32Array,
  w: number,
  h: number,
  minValue: number,
  sep: number,
  limit: number,
): Array<{ gx: number; gy: number; value: number }> {
  const cand: Array<{ gx: number; gy: number; value: number }> = [];
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const v = data[gy * w + gx];
      if (v >= minValue) cand.push({ gx, gy, value: v });
    }
  }
  cand.sort((a, b) => b.value - a.value);
  const chosen: Array<{ gx: number; gy: number; value: number }> = [];
  for (const c of cand) {
    if (chosen.some((p) => Math.hypot(p.gx - c.gx, p.gy - c.gy) < sep)) continue;
    chosen.push(c);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/**
 * Turn the accumulated dwell + ingress grids into ranked, human-readable trap
 * recommendations. Hotspots (loiter) and ingress points (entry paths) each map
 * to a countermeasure an operator would actually take.
 */
export function computeTrapSuggestions(dwell: DwellMap): TrapSuggestion[] {
  const out: TrapSuggestion[] = [];
  const { w, h, grid, ingress, maxDwell, maxIngress } = dwell;

  // Loiter hotspots — only meaningful once some real dwell has accumulated.
  if (maxDwell > 4) {
    const hs = peaks(grid, w, h, Math.max(4, maxDwell * 0.35), 6, 3);
    for (const p of hs) {
      const nx = (p.gx + 0.5) / w;
      const ny = (p.gy + 0.5) / h;
      const conf = clamp(p.value / maxDwell, 0, 1);
      out.push({
        id: uid(),
        kind: "hotspot",
        priority: conf > 0.7 ? "high" : conf > 0.4 ? "medium" : "low",
        confidence: conf,
        x: nx,
        y: ny,
        title: `Loiter hotspot — ${locationWord(nx, ny)}`,
        detail: `Activity concentrates here. Place a bait station or snap trap in the ${locationWord(nx, ny)}.`,
        metric: `${Math.round(p.value)}s dwell`,
      });
    }
  }

  // Ingress points — where things enter/leave the monitored area.
  if (maxIngress > 2) {
    const ig = peaks(ingress, w, h, Math.max(2, maxIngress * 0.4), 6, 2);
    for (const p of ig) {
      const nx = (p.gx + 0.5) / w;
      const ny = (p.gy + 0.5) / h;
      const conf = clamp(p.value / maxIngress, 0, 1);
      out.push({
        id: uid(),
        kind: "ingress",
        priority: conf > 0.7 ? "high" : "medium",
        confidence: conf,
        x: nx,
        y: ny,
        title: `Entry path — ${locationWord(nx, ny)}`,
        detail: `Pests repeatedly enter/exit here. Seal the gap or set a trap along this path in the ${locationWord(nx, ny)}.`,
        metric: `${Math.round(p.value)} crossings`,
      });
    }
  }

  // Ingress first (stop them getting in), then hotspots by confidence.
  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "ingress" ? -1 : 1;
    return b.confidence - a.confidence;
  });
}
