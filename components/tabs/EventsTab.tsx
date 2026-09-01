"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import {
  clearHistory,
  EVENT_MAX,
  exportEventsCsv,
  exportEventsJson,
  exportFlaggedZip,
  getSnapshot,
} from "@/lib/history-db";
import type { EventKind, EventRecord } from "@/lib/types";

/** Why the retrain export exists — reused on every control that feeds it. */
const RETRAIN_HINT =
  "Download flagged snapshots to correct the model (upload to Roboflow as negatives)";

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
 * Evidence thumbnail. The blob is read when the row scrolls into view and
 * released again when it leaves — a few hundred live object URLs would pin
 * every stored JPEG in memory, and an IDB re-read on scroll-back is cheap.
 * Events with no snapshot (anything logged before the feature, or with
 * snapshots turned off) simply render nothing.
 */
function EventThumb({ id, onOpen }: { id: string; onOpen: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    let visible = false;
    let objectUrl: string | null = null;
    const release = () => {
      if (!objectUrl) return;
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      setUrl(null);
    };
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1].isIntersecting;
        if (!visible) return release();
        if (objectUrl) return;
        getSnapshot(id)
          .then((b) => {
            // A fast scroll can land this after the row has left again.
            if (!alive || !visible || !b) return;
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
      release();
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
function SnapshotViewer({
  event,
  onClose,
  onToggleFlag,
}: {
  event: EventRecord;
  onClose: () => void;
  onToggleFlag: () => void;
}) {
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
          {event.kind === "pest" && (
            <button
              className={`btn ghost${event.flagged ? " flagged" : ""}`}
              onClick={onToggleFlag}
              title={RETRAIN_HINT}
              style={{ marginRight: "auto" }}
            >
              {event.flagged ? "Flagged ✓" : "Not a pest"}
            </button>
          )}
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
  const toggleEventFlag = useStore((s) => s.toggleEventFlag);
  const activity = useStore((s) => s.activity);
  const histCount = useStore((s) => s.histCount);
  const setHistCount = useStore((s) => s.setHistCount);
  const [filter, setFilter] = useState<EventKind | "all">("all");
  // Flagged is orthogonal to kind — an event has both a kind and a verdict —
  // so it narrows whatever kind filter is active rather than replacing it.
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [withImages, setWithImages] = useState(false);
  // Held by id, not by value, so the open viewer picks up its own flag changes.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = useMemo(
    () => events.find((e) => e.id === viewingId) ?? null,
    [events, viewingId],
  );

  async function exportFlagged() {
    if (typeof window === "undefined") return;
    try {
      const n = await exportFlaggedZip();
      if (n === 0) {
        window.alert('No events are flagged yet — open a pest snapshot and mark it "Not a pest".');
      }
    } catch {
      // Reading history can fail outright — private browsing, or another tab
      // holding an older database version open. Say so rather than letting the
      // button do nothing: the flags still on screen are in-memory only in that
      // case, so silence here looks identical to an empty archive.
      window.alert(
        "Couldn't read saved history, so nothing was exported. Flags marked in this session may not have been saved.",
      );
    }
  }

  async function wipeHistory() {
    if (typeof window !== "undefined" && !window.confirm("Delete all saved event history and snapshots? This cannot be undone.")) {
      return;
    }
    await clearHistory();
    clearEvents();
    setHistCount(0);
  }

  const filtered = useMemo(() => {
    const byKind = filter === "all" ? events : events.filter((e) => e.kind === filter);
    return flaggedOnly ? byKind.filter((e) => e.flagged) : byKind;
  }, [events, filter, flaggedOnly]);

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
          <button
            className={`chip sm${flaggedOnly ? " on" : ""}`}
            onClick={() => setFlaggedOnly((v) => !v)}
            title="Show only events marked as false positives"
          >
            flagged
          </button>
          <span
            className="mono-caps"
            style={{ marginLeft: 8, fontSize: 10, color: "var(--faint)", alignSelf: "center" }}
            title={
              histCount >= EVENT_MAX
                ? `Persistent history is capped at ${EVENT_MAX} events — older events are pruned as new ones arrive. Export to keep them.`
                : "events saved to persistent history"
            }
          >
            {histCount} saved{histCount >= EVENT_MAX ? " · capped" : ""}
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
          <button className="btn ghost" onClick={() => void exportFlagged()} title={RETRAIN_HINT}>
            Export flagged
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
          <span className="mono-caps" style={{ fontSize: 10, color: "var(--faint)" }}>
            Activity — last 15 min
          </span>
          <span className="mono-caps" style={{ fontSize: 10, color: "var(--faint)" }}>
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
            {/* The chip lives inside the message cell so the row keeps its four columns. */}
            <span className="evt-msg">
              {e.message}
              {e.flagged && (
                <span className="evt-flag" title="Marked as a false positive">
                  not a pest
                </span>
              )}
            </span>
            {e.kind === "pest" && <EventThumb id={e.id} onOpen={() => setViewingId(e.id)} />}
          </div>
        ))}
      </div>

      {viewing && (
        <SnapshotViewer
          event={viewing}
          onClose={() => setViewingId(null)}
          onToggleFlag={() => toggleEventFlag(viewing.id)}
        />
      )}
    </div>
  );
}
