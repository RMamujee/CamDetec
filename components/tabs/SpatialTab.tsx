"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { engine } from "@/lib/engine";
import { useStore } from "@/lib/store";
import { SKELETON_EDGES, KP_MIN_SCORE } from "@/lib/pose";
import type { SpatialObject, SpatialFigure, SpatialMarker } from "../three/SpatialView";

const SpatialView = dynamic(() => import("../three/SpatialView"), {
  ssr: false,
  loading: () => <div className="empty-note">initializing 3D view…</div>,
});

const FLOOR_X = 16;
const DEPTH = 14;
const FIG_H = 6;

type SceneData = { objects: SpatialObject[]; figures: SpatialFigure[]; markers: SpatialMarker[] };

export default function SpatialTab() {
  const mirror = useStore((s) => s.settings.mirror);
  const camera = useStore((s) => s.camera);
  const suggestions = useStore((s) => s.trapSuggestions);
  const [scene, setScene] = useState<SceneData>({ objects: [], figures: [], markers: [] });

  useEffect(() => {
    const id = setInterval(() => {
      const vw = engine.videoW || 1;
      const vh = engine.videoH || 1;
      const dx = (nx: number) => ((mirror ? 1 - nx : nx) - 0.5) * FLOOR_X;
      const dz = (ny: number) => (Math.min(1, ny) - 0.5) * DEPTH;

      const objects: SpatialObject[] = engine.objects.map((o) => {
        const [bx, by, bw, bh] = o.bbox;
        return {
          id: o.id,
          cls: o.class,
          pest: o.isPest,
          x: dx((bx + bw / 2) / vw),
          z: dz((by + bh) / vh),
          height: 0.6 + (bh / vh) * 4,
          size: 0.45 + (bw / vw) * 2.2,
        };
      });

      const figures: SpatialFigure[] = [];
      engine.poses.forEach((pose, pi) => {
        const kps = pose.keypoints;
        const disp = kps.map((k) => ({ ...k, dx: mirror ? vw - k.x : k.x }));
        const vis = disp.filter((k) => k.score > KP_MIN_SCORE);
        if (vis.length < 3) return;
        const cx = vis.reduce((s, k) => s + k.dx, 0) / vis.length;
        const bottomY = Math.max(...vis.map((k) => k.y));
        const nxCenter = cx / vw;
        const nyBottom = bottomY / vh;
        const lx = (k: { dx: number }) => ((k.dx - cx) / vh) * FIG_H;
        const ly = (k: { y: number }) => ((bottomY - k.y) / vh) * FIG_H;
        const segments: [[number, number], [number, number]][] = [];
        for (const [a, b] of SKELETON_EDGES) {
          const ka = disp[a];
          const kb = disp[b];
          if (!ka || !kb || ka.score < KP_MIN_SCORE || kb.score < KP_MIN_SCORE) continue;
          segments.push([
            [lx(ka), ly(ka)],
            [lx(kb), ly(kb)],
          ]);
        }
        const nose = disp[0];
        const hands: [number, number][] = [];
        for (const idx of [9, 10]) {
          const k = disp[idx];
          if (k && k.score > KP_MIN_SCORE) hands.push([lx(k), ly(k)]);
        }
        const feet: [number, number][] = [];
        for (const idx of [15, 16]) {
          const k = disp[idx];
          if (k && k.score > KP_MIN_SCORE) feet.push([lx(k), ly(k)]);
        }
        figures.push({
          id: pi,
          x: dx(nxCenter),
          z: dz(nyBottom),
          segments,
          head: nose && nose.score > KP_MIN_SCORE ? [lx(nose), ly(nose)] : null,
          hands,
          feet,
        });
      });

      const markers: SpatialMarker[] = suggestions.map((s) => ({
        id: s.id,
        x: dx(s.x),
        z: dz(s.y),
        radius: 0.7 + s.confidence * 2,
        ingress: s.kind === "ingress",
        high: s.priority === "high",
      }));

      setScene({ objects, figures, markers });
    }, 140);
    return () => clearInterval(id);
  }, [mirror, suggestions]);

  const pestCount = scene.objects.filter((o) => o.pest).length;
  const hotspots = scene.markers.filter((m) => !m.ingress).length;

  return (
    <div className="spatial">
      {camera.status === "live" ? (
        <SpatialView objects={scene.objects} figures={scene.figures} markers={scene.markers} />
      ) : (
        <div className="gate">
          <div className="gate-glyph" />
          <p>Spatial view is offline. Arm the console on the Live tab to map activity in 3D.</p>
        </div>
      )}

      <div className="spatial-overlay">
        <div className="readout">
          <div className="section-title" style={{ marginBottom: 8 }}>
            Spatial map
          </div>
          <div className="readout-row">
            <span>Contacts</span>
            <b>{scene.objects.length}</b>
          </div>
          <div className="readout-row">
            <span>Pests</span>
            <b style={{ color: pestCount ? "var(--signal)" : undefined }}>{pestCount}</b>
          </div>
          <div className="readout-row">
            <span>Bodies tracked</span>
            <b>{scene.figures.length}</b>
          </div>
          <div className="readout-row">
            <span>Trap hotspots</span>
            <b style={{ color: hotspots ? "var(--signal)" : undefined }}>{hotspots}</b>
          </div>
          <div style={{ color: "var(--faint)", fontSize: 10.5, marginTop: 10, lineHeight: 1.6 }}>
            Depth is estimated from frame geometry — position across the frame maps to width,
            distance from the bottom edge maps to depth.
          </div>
        </div>
        <div className="spatial-hint">drag to orbit · scroll to zoom</div>
      </div>
    </div>
  );
}
