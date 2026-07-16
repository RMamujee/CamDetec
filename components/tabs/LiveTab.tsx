"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { engine } from "@/lib/engine";
import type { OverlayFlags } from "@/lib/types";
import ToggleChip from "../hud/ToggleChip";
import DetectionOverlay from "../hud/DetectionOverlay";

const OVERLAY_CHIPS: { key: keyof OverlayFlags; label: string; warm?: boolean }[] = [
  { key: "boxes", label: "Boxes" },
  { key: "labels", label: "Labels" },
  { key: "ids", label: "IDs" },
  { key: "confidence", label: "Confidence" },
  { key: "skeleton", label: "Limbs" },
  { key: "trails", label: "Trails" },
  { key: "reticles", label: "Reticles" },
  { key: "motionHeat", label: "Motion heat", warm: true },
];

function useLiveMotion() {
  const [m, setM] = useState({ level: 0, regions: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      setM({ level: engine.motion?.level ?? 0, regions: engine.motion?.regions.length ?? 0 });
    }, 140);
    return () => clearInterval(id);
  }, []);
  return m;
}

export default function LiveTab({ onStart }: { onStart: () => void }) {
  const overlays = useStore((s) => s.overlays);
  const toggleOverlay = useStore((s) => s.toggleOverlay);
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const camera = useStore((s) => s.camera);
  const model = useStore((s) => s.model);
  const contacts = useStore((s) => s.contacts);
  const zones = useStore((s) => s.zones);
  const addZone = useStore((s) => s.addZone);
  const clearZones = useStore((s) => s.clearZones);
  const motion = useLiveMotion();

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ sx: number; sy: number } | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [tempRect, setTempRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );

  const live = camera.status === "live";
  const sorted = [...contacts].sort(
    (a, b) => Number(b.isPest) - Number(a.isPest) || b.score - a.score,
  );

  // Esc cancels zone drawing.
  useEffect(() => {
    if (!drawMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawMode(false);
        setTempRect(null);
        dragRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawMode]);

  // Screen point -> normalized, un-mirrored video coords (contain letterbox).
  const screenToVideo = useCallback(
    (clientX: number, clientY: number) => {
      const el = stageRef.current;
      const vw = engine.videoW;
      const vh = engine.videoH;
      if (!el || !vw || !vh) return null;
      const rect = el.getBoundingClientRect();
      const scale = Math.min(rect.width / vw, rect.height / vh);
      const offX = (rect.width - vw * scale) / 2;
      const offY = (rect.height - vh * scale) / 2;
      const x = (clientX - rect.left - offX) / scale;
      const y = (clientY - rect.top - offY) / scale;
      let nx = x / vw;
      const ny = y / vh;
      if (settings.mirror) nx = 1 - nx;
      return { x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) };
    },
    [settings.mirror],
  );

  return (
    <div className="live">
      <div className="live-toolbar">
        <span className="eyebrow" style={{ marginRight: 4 }}>
          Overlays
        </span>
        {OVERLAY_CHIPS.map((c) => (
          <ToggleChip
            key={c.key}
            label={c.label}
            on={overlays[c.key]}
            warm={c.warm}
            onClick={() => toggleOverlay(c.key)}
          />
        ))}
      </div>

      {/* left rail — controls, zones, motion */}
      <div className="rail left">
        <div className="panel">
          <div className="panel-head">
            <span className="title">Detection</span>
          </div>
          <div className="panel-body" style={{ display: "grid", gap: 16 }}>
            <div className="field">
              <div className="field-top">
                <span className="eyebrow">Confidence</span>
                <span className="field-val">{Math.round(settings.confidence * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.05}
                value={settings.confidence}
                onChange={(e) => setSetting("confidence", Number(e.target.value))}
              />
            </div>
            <div className="field">
              <div className="field-top">
                <span className="eyebrow">Motion sensitivity</span>
                <span className="field-val">{Math.round(settings.motionSensitivity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={settings.motionSensitivity}
                onChange={(e) => setSetting("motionSensitivity", Number(e.target.value))}
              />
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <ToggleChip
                label="Pest mode"
                on={settings.pestMode}
                warm
                onClick={() => setSetting("pestMode", !settings.pestMode)}
              />
              <ToggleChip
                label="Limbs"
                on={settings.poseEnabled}
                onClick={() => setSetting("poseEnabled", !settings.poseEnabled)}
              />
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="title">Watch zones</span>
            <span className="count">{zones.length}</span>
          </div>
          <div className="panel-body" style={{ display: "grid", gap: 10 }}>
            <p style={{ color: "var(--faint)", fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
              Draw a rectangle over an entry or hotspot. You&apos;ll get a log entry each time
              something crosses into it.
            </p>
            <div style={{ display: "flex", gap: 7 }}>
              <button
                className={`btn${drawMode ? " primary" : ""}`}
                onClick={() => setDrawMode((d) => !d)}
                disabled={!live}
                style={{ flex: 1 }}
              >
                {drawMode ? "Drawing…" : "Draw zone"}
              </button>
              <button className="btn ghost" onClick={clearZones} disabled={zones.length === 0}>
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="title">Motion</span>
            <span className="count">{motion.regions} zones</span>
          </div>
          <div className="panel-body">
            <div className="field-top" style={{ marginBottom: 7 }}>
              <span className="eyebrow">Frame activity</span>
              <span
                className="field-val"
                style={{ color: motion.level > 0.06 ? "var(--signal)" : "var(--text)" }}
              >
                {(motion.level * 100).toFixed(1)}%
              </span>
            </div>
            <div className={`meter${motion.level > 0.06 ? " warm" : ""}`}>
              <i style={{ width: `${Math.min(100, motion.level * 400)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* center stage */}
      <div className="stage-wrap" ref={stageRef}>
        <DetectionOverlay />

        {drawMode && (
          <div
            className="zone-draw"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const rect = stageRef.current!.getBoundingClientRect();
              dragRef.current = { sx: e.clientX, sy: e.clientY };
              setTempRect({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 });
            }}
            onPointerMove={(e) => {
              const d = dragRef.current;
              if (!d) return;
              const rect = stageRef.current!.getBoundingClientRect();
              setTempRect({
                x: Math.min(d.sx, e.clientX) - rect.left,
                y: Math.min(d.sy, e.clientY) - rect.top,
                w: Math.abs(e.clientX - d.sx),
                h: Math.abs(e.clientY - d.sy),
              });
            }}
            onPointerUp={(e) => {
              const d = dragRef.current;
              dragRef.current = null;
              setTempRect(null);
              setDrawMode(false);
              if (!d) return;
              const a = screenToVideo(d.sx, d.sy);
              const b = screenToVideo(e.clientX, e.clientY);
              if (!a || !b) return;
              const zx = Math.min(a.x, b.x);
              const zy = Math.min(a.y, b.y);
              const zw = Math.abs(a.x - b.x);
              const zh = Math.abs(a.y - b.y);
              if (zw < 0.02 || zh < 0.02) return;
              addZone({ x: zx, y: zy, w: zw, h: zh });
            }}
          >
            <div className="zone-draw-hint">Drag to draw a watch zone · Esc to cancel</div>
            {tempRect && (
              <div
                className="zone-temp"
                style={{ left: tempRect.x, top: tempRect.y, width: tempRect.w, height: tempRect.h }}
              />
            )}
          </div>
        )}

        {!live && (
          <div className="gate">
            <div className="gate-glyph" />
            <h1>
              CamDetec <span>· pest monitoring</span>
            </h1>
            <p>
              Point a camera at a doorway, garden, or crawlspace. Everything runs on this device —
              the feed is never uploaded. Arm the console to start tracking movement and mapping
              where pests enter and loiter.
            </p>
            {camera.status === "denied" && (
              <div className="gate-err">Camera access blocked. Enable it in your browser settings.</div>
            )}
            {camera.status === "error" && <div className="gate-err">Camera error: {camera.error}</div>}
            <button className="btn primary" onClick={onStart}>
              {camera.status === "requesting" ? "Requesting camera…" : "Arm console"}
            </button>
            {model.status === "loading" && (
              <div className="gate-load">loading detector — {model.message}</div>
            )}
          </div>
        )}
      </div>

      {/* right rail — contacts */}
      <div className="rail right">
        <div className="panel" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div className="panel-head">
            <span className="title">Contacts</span>
            <span className="count">{contacts.length}</span>
          </div>
          <div className="panel-body" style={{ overflowY: "auto", flex: 1 }}>
            {sorted.length === 0 && (
              <div className="empty-note">{live ? "Nothing in frame" : "Console offline"}</div>
            )}
            {sorted.map((c) => (
              <div key={c.id} className={`contact${c.isPest ? " pest" : ""}`}>
                <span className="contact-id">#{c.id}</span>
                <span className="contact-name">{c.class}</span>
                <span className="contact-score">{Math.round(c.score * 100)}%</span>
                <div className="contact-bar">
                  <i style={{ width: `${Math.round(c.score * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
