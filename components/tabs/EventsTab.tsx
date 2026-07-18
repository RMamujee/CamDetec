"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { exportEventsCsv, exportEventsJson, clearHistory } from "@/lib/history-db";
import type { EventKind } from "@/lib/types";

const KINDS: (EventKind | "all")[] = [
  "all",
  "pest",
  "motion",
  "zone",
  "ingress",
  "enter",
  "exit",
  "system",
];

function fmtTime(t: number): string {
  const d = new Date(t);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function EventsTab() {
  const events = useStore((s) => s.events);
  const clearEvents = useStore((s) => s.clearEvents);
  const activity = useStore((s) => s.activity);
  const histCount = useStore((s) => s.histCount);
  const setHistCount = useStore((s) => s.setHistCount);
  const [filter, setFilter] = useState<EventKind | "all">("all");

  async function wipeHistory() {
    if (typeof window !== "undefined" && !window.confirm("Delete all saved event history? This cannot be undone.")) {
      return;
    }
    await clearHistory();
    clearEvents();
    setHistCount(0);
  }

  const filtered = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.kind === filter)),
    [events, filter],
  );

  const maxCount = Math.max(1, ...activity.map((a) => a.count));

  return (
    <div className="events">
      <div className="section-head">
        <span className="section-title">Event Log</span>
        <div className="filters">
          {KINDS.map((k) => (
            <button
              key={k}
              className={`chip sm${filter === k ? " on" : ""}${k === "pest" ? " warm" : ""}`}
              onClick={() => setFilter(k)}
            >
              {k}
            </button>
          ))}
          <span
            className="mono-caps"
            style={{ marginLeft: 8, fontSize: 10, color: "var(--text-faint)", alignSelf: "center" }}
            title="events saved to persistent history"
          >
            {histCount} saved
          </span>
          <button className="btn ghost" onClick={() => exportEventsCsv()} style={{ marginLeft: 8 }} title="Download all saved events as CSV">
            CSV
          </button>
          <button className="btn ghost" onClick={() => exportEventsJson()} title="Download all saved events as JSON">
            JSON
          </button>
          <button className="btn ghost" onClick={clearEvents} title="Clear the on-screen log (saved history is kept)">
            Clear
          </button>
          <button className="btn ghost" onClick={wipeHistory} title="Delete the persistent history (IndexedDB)">
            Wipe
          </button>
        </div>
      </div>

      <div className="timeline">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span className="mono-caps" style={{ fontSize: 10, color: "var(--text-faint)" }}>
            Activity — last 15 min
          </span>
          <span className="mono-caps" style={{ fontSize: 10, color: "var(--text-faint)" }}>
            {activity.reduce((n, a) => n + a.count, 0)} detections
          </span>
        </div>
        <div className="timeline-bars">
          {activity.length === 0 && (
            <div className="empty-note" style={{ width: "100%" }}>
              no activity recorded yet
            </div>
          )}
          {activity.map((a) => (
            <div
              key={a.t}
              className={`bar${a.pest > 0 ? " pest" : ""}`}
              title={`${fmtTime(a.t)} · ${a.count} in frame${a.pest ? ` · ${a.pest} pest` : ""}`}
              style={{ height: `${Math.max(4, (a.count / maxCount) * 100)}%` }}
            />
          ))}
        </div>
        {activity.length > 0 && (
          <div className="timeline-axis">
            <span>{fmtTime(activity[0].t)}</span>
            <span>now</span>
          </div>
        )}
      </div>

      <div className="eventlog">
        {filtered.length === 0 && <div className="empty-note">no events</div>}
        {filtered.map((e) => (
          <div key={e.id} className={`evt${e.kind === "pest" ? " pest" : ""}`}>
            <span className="evt-time">{fmtTime(e.t)}</span>
            <span className={`evt-kind ${e.kind}`}>{e.kind}</span>
            <span className="evt-msg">{e.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
