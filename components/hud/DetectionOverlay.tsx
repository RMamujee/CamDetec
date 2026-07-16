"use client";
import { useEffect, useRef } from "react";
import { engine } from "@/lib/engine";
import { useStore } from "@/lib/store";
import { SKELETON_EDGES, KP_MIN_SCORE } from "@/lib/pose";

const COOL = "#57c7cf"; // neutral objects
const WARM = "#ff8a3d"; // pests / activity
const BONE = "rgba(214,236,236,0.88)";
const ZONE = "#57cf98"; // watch zones
const HAND_FOOT = "#8fe3e8"; // hands / feet accents

/**
 * The live view. The video frame and every overlay are painted onto one canvas
 * in a single pass so mirroring, letterboxing, and overlay geometry stay
 * aligned. Reads the hot-path `engine` each rAF; overlay flags from the store.
 */
export default function DetectionOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#090c0d";
      ctx.fillRect(0, 0, cw, ch);

      const video = engine.video;
      const vw = engine.videoW;
      const vh = engine.videoH;
      if (!video || !vw || !vh) return;

      const ov = useStore.getState().overlays;
      const mirror = useStore.getState().settings.mirror;

      const scale = Math.min(cw / vw, ch / vh);
      const drawW = vw * scale;
      const drawH = vh * scale;
      const offX = (cw - drawW) / 2;
      const offY = (ch - drawH) / 2;
      const mapX = (x: number) => (mirror ? offX + (vw - x) * scale : offX + x * scale);
      const mapY = (y: number) => offY + y * scale;

      // video frame
      ctx.save();
      if (mirror) {
        ctx.translate(offX + drawW, offY);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, drawW, drawH);
      } else {
        ctx.drawImage(video, offX, offY, drawW, drawH);
      }
      ctx.restore();

      // motion heatmap (warm ramp)
      const motion = engine.motion;
      if (ov.motionHeat && motion) {
        const sx = vw / motion.gridW;
        const sy = vh / motion.gridH;
        for (let gy = 0; gy < motion.gridH; gy++) {
          for (let gx = 0; gx < motion.gridW; gx++) {
            const v = motion.grid[gy * motion.gridW + gx];
            if (v < 0.08) continue;
            const xA = mapX(gx * sx);
            const xB = mapX((gx + 1) * sx);
            const left = Math.min(xA, xB);
            const w = Math.abs(xB - xA) + 1;
            const top = mapY(gy * sy);
            const h = sy * scale + 1;
            const a = Math.min(0.5, v * 0.6);
            ctx.fillStyle = v > 0.55 ? `rgba(255,77,79,${a})` : `rgba(255,138,61,${a})`;
            ctx.fillRect(left, top, w, h);
          }
        }
      }

      // watch zones (under skeletons/objects)
      const zones = useStore.getState().zones;
      if (zones.length) {
        for (const z of zones) {
          const zx1 = mapX(z.x * vw);
          const zx2 = mapX((z.x + z.w) * vw);
          const left = Math.min(zx1, zx2);
          const zw = Math.abs(zx2 - zx1);
          const top = mapY(z.y * vh);
          const zh = z.h * vh * scale;
          ctx.save();
          ctx.setLineDash([9 * dpr, 6 * dpr]);
          ctx.strokeStyle = ZONE;
          ctx.lineWidth = 1.5 * dpr;
          ctx.strokeRect(left, top, zw, zh);
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.06;
          ctx.fillStyle = ZONE;
          ctx.fillRect(left, top, zw, zh);
          ctx.globalAlpha = 1;
          const occ = engine.zoneOcc[z.id] ?? 0;
          const label = `ZONE ${z.id}${occ > 0 ? ` · ${occ}` : ""}`;
          ctx.font = `${11 * dpr}px ui-monospace, SFMono-Regular, monospace`;
          const lw = ctx.measureText(label).width + 10 * dpr;
          const lh = 17 * dpr;
          const ly = top - lh - 2 * dpr < offY ? top + 2 * dpr : top - lh - 2 * dpr;
          ctx.fillStyle = "rgba(9,12,13,0.82)";
          ctx.fillRect(left, ly, lw, lh);
          ctx.fillStyle = ZONE;
          ctx.textBaseline = "middle";
          ctx.fillText(label, left + 5 * dpr, ly + lh / 2 + 0.5 * dpr);
          ctx.restore();
        }
      }

      // skeletons / limbs (with hands + feet)
      if (ov.skeleton && engine.poses.length) {
        for (const pose of engine.poses) {
          const kp = pose.keypoints;
          const ok = (i: number) => kp[i] && kp[i].score >= KP_MIN_SCORE;
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = BONE;
          ctx.lineCap = "round";
          for (const [a, b] of SKELETON_EDGES) {
            if (!ok(a) || !ok(b)) continue;
            ctx.beginPath();
            ctx.moveTo(mapX(kp[a].x), mapY(kp[a].y));
            ctx.lineTo(mapX(kp[b].x), mapY(kp[b].y));
            ctx.stroke();
          }
          // joints
          ctx.fillStyle = COOL;
          for (const k of kp) {
            if (k.score < KP_MIN_SCORE) continue;
            ctx.beginPath();
            ctx.arc(mapX(k.x), mapY(k.y), 3, 0, Math.PI * 2);
            ctx.fill();
          }
          // head at the nose
          if (ok(0)) {
            ctx.strokeStyle = HAND_FOOT;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(mapX(kp[0].x), mapY(kp[0].y), Math.max(7, drawH / 90), 0, Math.PI * 2);
            ctx.stroke();
          }
          // hands: emphasized rings at the wrists (9, 10)
          ctx.fillStyle = HAND_FOOT;
          ctx.strokeStyle = HAND_FOOT;
          for (const idx of [9, 10]) {
            if (!ok(idx)) continue;
            const hr = Math.max(6, drawW / 150);
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.arc(mapX(kp[idx].x), mapY(kp[idx].y), hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          // feet: markers at the ankles (15, 16)
          for (const idx of [15, 16]) {
            if (!ok(idx)) continue;
            ctx.beginPath();
            ctx.arc(mapX(kp[idx].x), mapY(kp[idx].y), Math.max(4, drawW / 260), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // objects
      for (const o of engine.objects) {
        const color = o.isPest ? WARM : COOL;
        const [bx, by, bw, bh] = o.bbox;
        const x1 = mapX(bx);
        const x2 = mapX(bx + bw);
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = mapY(by);
        const w = right - left;
        const h = bh * scale;

        if (ov.trails && o.trail.length > 1) {
          ctx.lineWidth = 2;
          for (let i = 1; i < o.trail.length; i++) {
            const p0 = o.trail[i - 1];
            const p1 = o.trail[i];
            const alpha = (i / o.trail.length) * 0.6;
            ctx.strokeStyle = o.isPest
              ? `rgba(255,138,61,${alpha})`
              : `rgba(87,199,207,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(mapX(p0[0]), mapY(p0[1]));
            ctx.lineTo(mapX(p1[0]), mapY(p1[1]));
            ctx.stroke();
          }
        }

        if (ov.boxes) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.globalAlpha = 0.9;
          ctx.strokeRect(left, top, w, h);
          ctx.globalAlpha = 1;
        }

        if (ov.reticles) {
          const c = Math.min(w, h) * 0.2;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(left, top + c);
          ctx.lineTo(left, top);
          ctx.lineTo(left + c, top);
          ctx.moveTo(right - c, top);
          ctx.lineTo(right, top);
          ctx.lineTo(right, top + c);
          ctx.moveTo(right, top + h - c);
          ctx.lineTo(right, top + h);
          ctx.lineTo(right - c, top + h);
          ctx.moveTo(left + c, top + h);
          ctx.lineTo(left, top + h);
          ctx.lineTo(left, top + h - c);
          ctx.stroke();
        }

        if (ov.labels || ov.ids || ov.confidence) {
          const parts: string[] = [];
          if (ov.ids) parts.push(`#${o.id}`);
          if (ov.labels) parts.push(o.class);
          if (ov.confidence) parts.push(`${Math.round(o.score * 100)}%`);
          const text = parts.join("  ");
          ctx.font = `${12 * dpr}px ui-monospace, SFMono-Regular, monospace`;
          const padX = 7 * dpr;
          const tw = ctx.measureText(text).width + padX * 2;
          const thh = 19 * dpr;
          let ly = top - thh - 3 * dpr;
          if (ly < offY) ly = top + 3 * dpr;
          ctx.fillStyle = o.isPest ? "rgba(255,138,61,0.92)" : "rgba(87,199,207,0.9)";
          ctx.fillRect(left, ly, tw, thh);
          ctx.fillStyle = "#0a0e10";
          ctx.textBaseline = "middle";
          ctx.fillText(text, left + padX, ly + thh / 2 + 0.5 * dpr);
        }
      }
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
