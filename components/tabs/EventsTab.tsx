"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { exportEventsCsv, exportEventsJson, clearHistory, getSnapshot } from "@/lib/history-db";
import type { EventKind, EventRecord } from "@/lib/types";

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

/**
 * Evidence thumbnail. The blob is only read once the row scrolls into view, and
 * its object URL is revoked on unmount — a few hundred live URLs would pin
 * every stored JPEG in memory. Events with no snapshot (anything logged before
 * the feature, or with snapshots turned off) simply render nothing.
 */
function EventThumb({ id, onOpen }: { id: string; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    let objectUrl: string | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        getSnapshot(id)
          .then((b) => {
            if (!alive || !b) return;
            objectUrl = URL.createObjectURL(b);
            setUrl(objectUrl);
          })
          .catch(() => {});
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return (
    <div className="evt-thumb" ref={ref}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="event snapshot" onClick={onOpen} title="View full size" />
      )}
    </div>
  );
}

/** Full-size viewer. Loads its own copy so it survives the row unmounting. */
function SnapshotViewer({ event, onClose }: { event: EventRecord; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  // Keyed on the event alone: `onClose` is a fresh closure every parent render,
  // and the log re-renders ~4Hz while detection runs — depending on it would
  // revoke and refetch this URL four times a second under the open image.
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    getSnapshot(event.id)
      .then((b) => {
        if (!alive || !b) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [event.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-head">
          <span className="evt-msg">{event.message}</span>
          <span className="mono-caps" style={{ fontSize: 10, color: "var(--faint)" }}>
            {new Date(event.t).toLocaleString()}
          </span>
        </div>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="event snapshot" />
        ) : (
          <div className="empty-note">loading snapshot…</div>
        )}
        <div className="lightbox-foot">
          {url && (
            <a className="btn ghost" href={url} download={`camdetec-${event.id}.jpg`}>
              Download
            </a>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EventsTab() {
  const events = useStore((s) => s.events);
  const clearEvents = useStore((s) => s.clearEvents);
  const activity = useStore((s) => s.activity);
  const histCount = useStore((s) => s.histCount);
  const setHistCount = useStore((s) => s.setHistCount);
  const [filter, setFilter] = useState<EventKind | "all">("all");
  const [withImages, setWithImages] = useState(false);
  const [viewing, setViewing] = useState<EventRecord | null>(null);

  async function wipeHistory() {
    if (typeof window !== "undefined" && !window.confirm("Delete all saved event history and snapshots? This cannot be undone.")) {
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
          <button className="btn ghost" onClick={() => exportEventsJson(withImages)} title="Download all saved events as JSON">
            JSON
          </button>
          <button
            className={`chip sm${withImages ? " on" : ""}`}
            onClick={() => setWithImages((v) => !v)}
            title="Embed snapshot images in the JSON export as base64 — much larger files"
          >
            + images
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
            {e.kind === "pest" && <EventThumb id={e.id} onOpen={() => setViewing(e)} />}
          </div>
        ))}
      </div>

      {viewing && <SnapshotViewer event={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
