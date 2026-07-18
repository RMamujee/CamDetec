"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { useCamera } from "@/lib/useCamera";
import { useDetectionLoop } from "@/lib/useDetectionLoop";
import { getRecentEvents, countEvents } from "@/lib/history-db";
import TopBar from "./hud/TopBar";
import LiveTab from "./tabs/LiveTab";
import PestMapTab from "./tabs/PestMapTab";
import EventsTab from "./tabs/EventsTab";
import DiagnosticsTab from "./tabs/DiagnosticsTab";
import SettingsTab from "./tabs/SettingsTab";
import SpatialTab from "./tabs/SpatialTab";

export default function CamDetecApp() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { start, stop, restart } = useCamera(videoRef);
  useDetectionLoop();
  const activeTab = useStore((s) => s.activeTab);

  // Restore persistent event history so the log survives reloads.
  useEffect(() => {
    let alive = true;
    getRecentEvents(400)
      .then((rows) => {
        if (alive && rows.length) useStore.getState().seedEvents(rows, rows.length);
      })
      .catch(() => {});
    countEvents()
      .then((n) => {
        if (alive) useStore.getState().setHistCount(n);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="shell">
      <TopBar onStart={start} onStop={stop} />
      <div className="content">
        {activeTab === "live" && <LiveTab onStart={start} />}
        {activeTab === "pestmap" && <PestMapTab />}
        {activeTab === "spatial" && <SpatialTab />}
        {activeTab === "events" && <EventsTab />}
        {activeTab === "diagnostics" && <DiagnosticsTab />}
        {activeTab === "settings" && <SettingsTab onStart={start} onRestart={restart} />}
      </div>
      {/* Persistent capture element — kept mounted across tab switches so the
          stream (and detection) never restarts. Rendered offscreen; the live
          view paints it onto a canvas. */}
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        style={{
          position: "absolute",
          width: 2,
          height: 2,
          opacity: 0,
          pointerEvents: "none",
          left: -10,
          top: -10,
        }}
      />
    </div>
  );
}
