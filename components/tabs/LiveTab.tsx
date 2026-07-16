"use client";
import { useEffect, useState } from "react";
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
  const motion = useLiveMotion();

  const live = camera.status === "live";
  const sorted = [...contacts].sort(
    (a, b) => Number(b.isPest) - Number(a.isPest) || b.score - a.score,
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

      {/* left rail — controls + motion */}
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
      <div className="stage-wrap">
        <DetectionOverlay />
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
