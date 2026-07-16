"use client";
import dynamic from "next/dynamic";

// Fully client-side: the app touches getUserMedia, canvas, WebGL (TF.js) and
// three.js — none of which belong on the server. ssr:false keeps them out of
// the server bundle entirely.
const CamDetecApp = dynamic(() => import("@/components/CamDetecApp"), {
  ssr: false,
  loading: () => (
    <div className="boot">
      <div className="boot-mark">CAMDETEC</div>
      <div className="boot-sub">initializing console…</div>
    </div>
  ),
});

export default function Page() {
  return <CamDetecApp />;
}
