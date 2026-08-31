// Evidence snapshots.
//
// A log line says a rodent was there; a picture proves it. When an event is
// confirmed we grab the frame that triggered it, draw the detection on top, and
// keep the JPEG next to the event record. The capture is taken from the raw
// video element — the low-light boost only ever touches the inference input, so
// the stored image is what the camera saw, not what the model was shown.

/** Long edge of a stored snapshot. Small enough that 300 of them stay cheap. */
const MAX_EDGE = 640;
const QUALITY = 0.7;

export interface SnapshotAnnotation {
  /** Detection box in video pixels; omitted for a whole-frame capture. */
  box?: [number, number, number, number];
  label: string;
  /** 0..1 confidence, drawn next to the label when present. */
  score?: number;
}

export async function captureSnapshot(
  video: HTMLVideoElement,
  ann: SnapshotAnnotation,
): Promise<Blob | null> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (typeof document === "undefined" || !vw || !vh) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
  const w = Math.round(vw * scale);
  const h = Math.round(vh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Draw synchronously: the caller is on the detection tick and the frame moves on.
  ctx.drawImage(video, 0, 0, w, h);

  const pct = ann.score != null ? ` ${Math.round(ann.score * 100)}%` : "";
  const caption = `${ann.label}${pct}`;
  const fontSize = Math.max(11, Math.round(w / 40));
  ctx.font = `600 ${fontSize}px ui-monospace, monospace`;
  ctx.textBaseline = "top";

  if (ann.box) {
    const [bx, by, bw, bh] = ann.box.map((v) => v * scale) as [number, number, number, number];
    ctx.lineWidth = Math.max(2, Math.round(w / 240));
    ctx.strokeStyle = "#ff8a3d";
    ctx.strokeRect(bx, by, bw, bh);

    const padding = 4;
    const textW = ctx.measureText(caption).width;
    const tagH = fontSize + padding * 2;
    // Keep the tag inside the frame when the box hugs the top edge.
    const tagY = by - tagH >= 0 ? by - tagH : by + ctx.lineWidth;
    ctx.fillStyle = "rgba(255, 138, 61, 0.9)";
    ctx.fillRect(bx, tagY, textW + padding * 2, tagH);
    ctx.fillStyle = "#201206";
    ctx.fillText(caption, bx + padding, tagY + padding);
  } else {
    ctx.fillStyle = "rgba(255, 138, 61, 0.9)";
    ctx.fillRect(8, 8, ctx.measureText(caption).width + 12, fontSize + 8);
    ctx.fillStyle = "#201206";
    ctx.fillText(caption, 14, 12);
  }

  // Timestamp burn-in — an evidence photo without a time is half an answer.
  const stampText = new Date().toLocaleString();
  ctx.font = `${Math.max(10, Math.round(w / 55))}px ui-monospace, monospace`;
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  const stampW = ctx.measureText(stampText).width + 10;
  ctx.fillRect(0, h - fontSize - 8, stampW, fontSize + 8);
  ctx.fillStyle = "#e8edec";
  ctx.fillText(stampText, 5, h - 4);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", QUALITY));
}
