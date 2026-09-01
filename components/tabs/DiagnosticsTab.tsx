"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? h + "h " : ""}${m}m ${sec}s`;
}

export default function DiagnosticsTab() {
  const d = useStore((s) => s.diagnostics);
  const stats = useStore((s) => s.stats);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const classEntries = Object.entries(stats.perClass).sort((a, b) => b[1] - a[1]);
  const maxClass = Math.max(1, ...classEntries.map((e) => e[1]));

  const tiles: {
    k: string;
    v: string;
    sub?: string;
    warm?: boolean;
    meter?: number;
    /** Long-form detail on hover — keeps error text out of the tile layout. */
    hint?: string;
  }[] = [
    { k: "Throughput", v: String(d.fps), sub: "fps", meter: Math.min(1, d.fps / 30) },
    { k: "Inference", v: String(d.inferenceMs), sub: "ms", meter: Math.min(1, d.inferenceMs / 200) },
    { k: "Bodies", v: String(d.posesActive) },
    { k: "Resolution", v: d.resolution },
    { k: "Compute", v: d.backend.toUpperCase() },
    {
      k: "JS heap",
      v: d.heapMB != null ? String(d.heapMB) : "—",
      sub: d.heapMB != null ? "MB" : undefined,
    },
    {
      k: "Battery",
      v: d.battery != null ? String(d.battery) : "—",
      sub: d.battery != null ? (d.charging ? "% ⚡" : "%") : undefined,
      warm: d.battery != null && d.battery < 20 && !d.charging,
      meter: d.battery != null ? d.battery / 100 : undefined,
    },
    { k: "Uptime", v: fmtUptime(now - stats.sessionStart) },
    {
      // Boost applies to the inference input only — stored snapshots stay raw.
      k: "Low light",
      v: d.lowLightActive ? "BOOST" : d.luma != null ? "OFF" : "—",
      sub: d.luma != null ? `luma ${Math.round(d.luma)}` : undefined,
      warm: d.lowLightActive,
      meter: d.luma != null ? Math.min(1, d.luma / 255) : undefined,
    },
    {
      // Held only while the camera is live; "—" covers both a stopped camera
      // and a browser without the API (Safari, Firefox).
      k: "Screen lock",
      v: d.wakeLock == null ? "—" : d.wakeLock ? "ON" : "OFF",
      sub: d.wakeLock === false ? "not held" : undefined,
      hint:
        d.wakeLock == null
          ? "Only held while the camera is live, and only where the Wake Lock API exists."
          : "The display is kept awake so the detection loop keeps running.",
    },
    {
      // A detector that fails every frame still reports "ready" — this is the
      // only place that shows it.
      k: "Detect errors",
      v: String(d.detectorErrors),
      sub: d.detectorErrors > 0 ? "in a row" : undefined,
      warm: d.detectorErrors > 0,
      hint: d.detectorError ?? undefined,
    },
  ];

  return (
    <div className="pad">
      <div className="section-title" style={{ marginBottom: 16 }}>
        System diagnostics
      </div>
      <div className="tile-grid">
        {tiles.map((t) => (
          <div key={t.k} className={`tile${t.warm ? " warm" : ""}`} title={t.hint}>
            <div className="k">{t.k}</div>
            <div className="v">
              {t.v}
              {t.sub && <small>{t.sub}</small>}
            </div>
            {t.meter != null && (
              <div className="meter">
                <i style={{ width: `${Math.round(t.meter * 100)}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="tile-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
        <div className="tile">
          <div className="k">Total contacts</div>
          <div className="v">{stats.totalContacts}</div>
        </div>
        <div className="tile warm">
          <div className="k">Pest contacts</div>
          <div className="v">{stats.pestContacts}</div>
        </div>
        <div className="tile">
          <div className="k">Peak concurrent</div>
          <div className="v">{stats.peakConcurrent}</div>
        </div>
        <div className="tile">
          <div className="k">Detector</div>
          <div className="v" style={{ fontSize: 13, fontFamily: "var(--font-sans)" }}>
            {d.model}
          </div>
        </div>
      </div>

      <div className="section-title" style={{ margin: "6px 0 14px" }}>
        Classification breakdown
      </div>
      <div className="panel">
        <div className="panel-body classbars">
          {classEntries.length === 0 && <div className="empty-note">no classifications yet</div>}
          {classEntries.map(([cls, n]) => (
            <div key={cls} className="classbar">
              <span className="name">{cls}</span>
              <div className="track">
                <i style={{ width: `${(n / maxClass) * 100}%` }} />
              </div>
              <span className="num">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
