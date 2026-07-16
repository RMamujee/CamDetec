"use client";
import { useEffect, useRef } from "react";
import { engine } from "@/lib/engine";
import { useStore } from "@/lib/store";

/**
 * Pest Map — the operational payoff. Accumulated dwell is drawn as a heat layer
 * over the (dimmed) frame, and trap/countermeasure suggestions are pinned where
 * pests loiter or enter. The side panel ranks those as actions an operator can
 * take: seal an entry path, place a bait station at a hotspot.
 */
export default function PestMapTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const camera = useStore((s) => s.camera);
  const suggestions = useStore((s) => s.trapSuggestions);
  const setTrapSuggestions = useStore((s) => s.setTrapSuggestions);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(wrap.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(wrap.clientHeight * dpr));
      canvas.style.width = wrap.clientWidth + "px";
      canvas.style.height = wrap.clientHeight + "px";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = "#090c0d";
      ctx.fillRect(0, 0, cw, ch);

      const video = engine.video;
      const vw = engine.videoW;
      const vh = engine.videoH;
      if (!video || !vw || !vh) return;

      const mirror = useStore.getState().settings.mirror;
      const scale = Math.min(cw / vw, ch / vh);
      const drawW = vw * scale;
      const drawH = vh * scale;
      const offX = (cw - drawW) / 2;
      const offY = (ch - drawH) / 2;
      const mapX = (x: number) => (mirror ? offX + (vw - x) * scale : offX + x * scale);
      const mapY = (y: number) => offY + y * scale;

      // dimmed frame for context
      ctx.save();
      ctx.globalAlpha = 0.4;
      if (mirror) {
        ctx.translate(offX + drawW, offY);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, drawW, drawH);
      } else {
        ctx.drawImage(video, offX, offY, drawW, drawH);
      }
      ctx.restore();
      ctx.fillStyle = "rgba(9,12,13,0.45)";
      ctx.fillRect(offX, offY, drawW, drawH);

      // dwell heat layer
      const dwell = engine.dwell;
      const sx = vw / dwell.w;
      const sy = vh / dwell.h;
      const max = dwell.maxDwell;
      for (let gy = 0; gy < dwell.h; gy++) {
        for (let gx = 0; gx < dwell.w; gx++) {
          const v = dwell.grid[gy * dwell.w + gx] / max;
          if (v < 0.06) continue;
          const xA = mapX(gx * sx);
          const xB = mapX((gx + 1) * sx);
          const left = Math.min(xA, xB);
          const w = Math.abs(xB - xA) + 1;
          const top = mapY(gy * sy);
          const h = sy * scale + 1;
          // amber -> red ramp
          const a = Math.min(0.72, 0.15 + v * 0.7);
          const r = 255;
          const g = Math.round(138 - v * 90);
          const b = Math.round(61 - v * 45);
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fillRect(left, top, w, h);
        }
      }

      // suggestion pins
      const recs = useStore.getState().trapSuggestions;
      recs.forEach((s, i) => {
        const px = mapX(s.x * vw);
        const py = mapY(s.y * vh);
        const hot = s.priority === "high";
        if (s.kind === "ingress") {
          ctx.strokeStyle = "#57c7cf";
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          ctx.arc(px, py, 11 * dpr, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = hot ? "#ff4d4f" : "#ff8a3d";
          ctx.beginPath();
          ctx.arc(px, py, 11 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = s.kind === "ingress" ? "#57c7cf" : "#0a0e10";
        ctx.font = `${11 * dpr}px ui-monospace, SFMono-Regular, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), px, py + 0.5 * dpr);
      });
      ctx.textAlign = "left";
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const resetMap = () => {
    engine.dwell.reset();
    setTrapSuggestions([]);
  };

  const hotspots = suggestions.filter((s) => s.kind === "hotspot").length;
  const ingress = suggestions.filter((s) => s.kind === "ingress").length;

  return (
    <div className="pestmap">
      <div className="pestmap-main" ref={wrapRef}>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
        {camera.status !== "live" && (
          <div className="gate">
            <div className="gate-glyph" />
            <p>Arm the console on the Live tab to start building the pest map.</p>
          </div>
        )}
        <div className="legend">
          <span className="item">
            <span className="sw" style={{ background: "#ff8a3d" }} /> Loiter hotspot
          </span>
          <span className="item">
            <span className="sw" style={{ border: "2px solid #57c7cf", background: "transparent" }} />{" "}
            Entry path
          </span>
          <span className="item">
            <span
              className="sw"
              style={{ background: "linear-gradient(90deg,#ff8a3d,#ff4d4f)" }}
            />{" "}
            Dwell heat
          </span>
        </div>
      </div>

      <div className="pestmap-side">
        <div>
          <div className="section-title">Trap suggestions</div>
          <div className="section-sub">Where to place traps &amp; countermeasures</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div className="tile" style={{ flex: 1, padding: 12 }}>
            <div className="k">Hotspots</div>
            <div className="v" style={{ fontSize: 22 }}>
              {hotspots}
            </div>
          </div>
          <div className="tile warm" style={{ flex: 1, padding: 12 }}>
            <div className="k">Entry points</div>
            <div className="v" style={{ fontSize: 22 }}>
              {ingress}
            </div>
          </div>
        </div>

        <div className="recs">
          {suggestions.length === 0 && (
            <div className="empty-note">
              Collecting activity. Suggestions appear as pests move through the frame and start to
              loiter.
            </div>
          )}
          {suggestions.map((s, i) => (
            <div key={s.id} className={`rec${s.priority === "high" ? " high" : ""}`}>
              <div className="rec-head">
                <span className="rec-kind">
                  {i + 1} · {s.kind === "ingress" ? "Entry path" : "Hotspot"}
                </span>
                <span className="rec-conf">{Math.round(s.confidence * 100)}%</span>
              </div>
              <div className="rec-body">{s.detail}</div>
              <div className="rec-meta">{s.metric}</div>
            </div>
          ))}
        </div>

        {suggestions.length > 0 && (
          <button className="btn ghost" onClick={resetMap}>
            Reset map
          </button>
        )}
      </div>
    </div>
  );
}
