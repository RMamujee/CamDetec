"use client";
import { useRef } from "react";
import { useStore } from "@/lib/store";
import { useCamera } from "@/lib/useCamera";
import { useDetectionLoop } from "@/lib/useDetectionLoop";
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
