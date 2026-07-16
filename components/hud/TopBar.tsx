"use client";
import { useStore } from "@/lib/store";
import type { TabId } from "@/lib/types";

const TABS: { id: TabId; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "pestmap", label: "Pest Map" },
  { id: "spatial", label: "3D" },
  { id: "events", label: "Events" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "settings", label: "Settings" },
];

function dotClass(status: string): string {
  switch (status) {
    case "live":
    case "ready":
      return "ok";
    case "requesting":
    case "loading":
      return "load";
    case "denied":
    case "error":
      return "err";
    default:
      return "";
  }
}

export default function TopBar({ onStart, onStop }: { onStart: () => void; onStop: () => void }) {
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const camera = useStore((s) => s.camera);
  const model = useStore((s) => s.model);
  const fps = useStore((s) => s.diagnostics.fps);
  const contacts = useStore((s) => s.contacts);
  const pestContacts = useStore((s) => s.stats.pestContacts);
  const pestMode = useStore((s) => s.settings.pestMode);
  const suggestions = useStore((s) => s.trapSuggestions);

  const live = camera.status === "live";
  const pestNow = contacts.filter((c) => c.isPest).length;
  const highRecs = suggestions.filter((s) => s.priority === "high").length;

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-glyph" />
        <div className="brand-name">
          CamDetec
        </div>
      </div>

      <nav className="tabnav">
        {TABS.map((t) => {
          let badge: string | null = null;
          let hot = false;
          if (t.id === "live" && contacts.length > 0) badge = String(contacts.length);
          if (t.id === "pestmap" && suggestions.length > 0) {
            badge = String(suggestions.length);
            hot = highRecs > 0;
          }
          if (t.id === "events" && pestContacts > 0) {
            badge = String(pestContacts);
            hot = true;
          }
          return (
            <button
              key={t.id}
              className={`tab-btn${activeTab === t.id ? " active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {badge && <span className={`tab-badge${hot ? " hot" : ""}`}>{badge}</span>}
            </button>
          );
        })}
      </nav>

      <div className="topbar-spacer" />

      <div className="status-cluster">
        {pestMode && (
          <div className="stat" title="Pest monitoring active">
            <span className={`dot ${pestNow > 0 ? "hot" : "warn"}`} />
            <b>{pestNow > 0 ? `${pestNow} on cam` : "armed"}</b>
          </div>
        )}
        <div className="stat" title={camera.error ?? camera.status}>
          <span className={`dot ${dotClass(camera.status)}`} />
          Camera <b>{live ? `${camera.width}×${camera.height}` : camera.status}</b>
        </div>
        <div className="stat" title={model.message}>
          <span className={`dot ${dotClass(model.status)}`} />
          Model <b>{model.status === "ready" ? "ready" : model.status}</b>
        </div>
        <div className="stat">
          <span className={`dot ${fps > 0 ? "ok" : ""}`} />
          <b>{fps}</b> fps
        </div>
        {live ? (
          <button className="btn danger" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button className="btn primary" onClick={onStart}>
            Arm console
          </button>
        )}
      </div>
    </header>
  );
}
