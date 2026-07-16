import type { MotionResult, MotionRegion } from "./types";

/**
 * Lightweight motion detector based on frame differencing of a downscaled
 * grayscale copy of the video. This works with no ML model at all, which is
 * exactly what a pest / security camera needs: it answers "is something moving,
 * and where" even for objects the object-detector has never been trained on.
 */
export class MotionDetector {
  private readonly procW = 160;
  private readonly procH = 120;
  readonly gridW = 40;
  readonly gridH = 30;

  private prev: Float32Array | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  private ensureCanvas() {
    if (this.canvas) return;
    const c = document.createElement("canvas");
    c.width = this.procW;
    c.height = this.procH;
    this.canvas = c;
    this.ctx = c.getContext("2d", { willReadFrequently: true });
  }

  /** Reset the reference frame (e.g. after the camera restarts). */
  reset() {
    this.prev = null;
  }

  /**
   * @param sensitivity 0..1 — higher means smaller movements register.
   */
  detect(video: HTMLVideoElement, sensitivity: number): MotionResult {
    this.ensureCanvas();
    const ctx = this.ctx!;
    const { procW, procH, gridW, gridH } = this;
    const empty: MotionResult = {
      level: 0,
      grid: new Float32Array(gridW * gridH),
      gridW,
      gridH,
      regions: [],
    };
    if (!video.videoWidth || !video.videoHeight) return empty;

    ctx.drawImage(video, 0, 0, procW, procH);
    let img: ImageData;
    try {
      img = ctx.getImageData(0, 0, procW, procH);
    } catch {
      // Cross-origin taint — shouldn't happen with a local camera stream.
      return empty;
    }
    const data = img.data;
    const n = procW * procH;
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      // Rec. 601 luma.
      gray[i] = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
    }

    if (!this.prev || this.prev.length !== n) {
      this.prev = gray;
      return empty;
    }

    // Per-pixel threshold: lower sensitivity -> ignore bigger changes.
    const pixThresh = 12 + (1 - sensitivity) * 45;
    const grid = new Float32Array(gridW * gridH);
    const cellW = procW / gridW;
    const cellH = procH / gridH;
    let moved = 0;

    const prev = this.prev;
    for (let y = 0; y < procH; y++) {
      const gy = Math.min(gridH - 1, (y / cellH) | 0);
      for (let x = 0; x < procW; x++) {
        const i = y * procW + x;
        const diff = Math.abs(gray[i] - prev[i]);
        if (diff > pixThresh) {
          moved++;
          const gx = Math.min(gridW - 1, (x / cellW) | 0);
          grid[gy * gridW + gx] += 1;
        }
      }
    }
    this.prev = gray;

    // Normalise each grid cell to 0..1 by pixels-per-cell.
    const perCell = (procW * procH) / (gridW * gridH);
    for (let i = 0; i < grid.length; i++) grid[i] = Math.min(1, grid[i] / (perCell * 0.6));

    const level = moved / n;
    const regions = this.extractRegions(grid, gridW, gridH, video.videoWidth, video.videoHeight);

    return { level, grid, gridW, gridH, regions };
  }

  /** Connected-component pass over the coarse grid to yield motion blobs. */
  private extractRegions(
    grid: Float32Array,
    gw: number,
    gh: number,
    videoW: number,
    videoH: number,
  ): MotionRegion[] {
    const cellThresh = 0.25;
    const visited = new Uint8Array(gw * gh);
    const regions: MotionRegion[] = [];
    const sx = videoW / gw;
    const sy = videoH / gh;
    const stack: number[] = [];

    for (let start = 0; start < grid.length; start++) {
      if (visited[start] || grid[start] < cellThresh) continue;
      let minX = gw,
        minY = gh,
        maxX = 0,
        maxY = 0,
        sum = 0,
        cells = 0;
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;
      while (stack.length) {
        const idx = stack.pop()!;
        const cx = idx % gw;
        const cy = (idx / gw) | 0;
        sum += grid[idx];
        cells++;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;
        // 4-neighbour flood.
        const neigh = [idx - 1, idx + 1, idx - gw, idx + gw];
        const onLeft = cx === 0;
        const onRight = cx === gw - 1;
        for (let k = 0; k < 4; k++) {
          const ni = neigh[k];
          if (ni < 0 || ni >= grid.length || visited[ni]) continue;
          if (k === 0 && onLeft) continue;
          if (k === 1 && onRight) continue;
          if (grid[ni] < cellThresh) continue;
          visited[ni] = 1;
          stack.push(ni);
        }
      }
      // Ignore single-cell speckle noise.
      if (cells < 2) continue;
      regions.push({
        x: minX * sx,
        y: minY * sy,
        w: (maxX - minX + 1) * sx,
        h: (maxY - minY + 1) * sy,
        intensity: sum / cells,
      });
    }
    // Strongest first, cap the count.
    regions.sort((a, b) => b.intensity * b.w * b.h - a.intensity * a.w * a.h);
    return regions.slice(0, 8);
  }
}
