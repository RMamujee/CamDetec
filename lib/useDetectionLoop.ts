"use client";
import { useEffect, useRef } from "react";
import { useStore } from "./store";
import { engine } from "./engine";
import { createDetector, type Detector } from "./detector";
import { MotionDetector } from "./motion";
import { Tracker } from "./tracker";
import { PoseEngine } from "./pose";
import { computeTrapSuggestions } from "./dwell";
import { isPestClass, pestLabel } from "./pest";
import type { Diagnostics, RawDetection, TrackedObject } from "./types";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Bottom-center of a bbox, normalized to 0..1 — an object's ground contact. */
function groundPoint(o: TrackedObject, vw: number, vh: number): [number, number] {
  return [(o.bbox[0] + o.bbox[2] / 2) / vw, (o.bbox[1] + o.bbox[3]) / vh];
}

/**
 * The heart of the app: one rAF loop that runs motion detection, object
 * detection, and (optionally) pose detection, feeds detections through the
 * tracker, accumulates the dwell/ingress maps, recomputes trap suggestions, and
 * pushes throttled snapshots to the store. Model loading is lazy.
 */
export function useDetectionLoop() {
  const detectorRef = useRef<Detector | null>(null);
  const motionRef = useRef<MotionDetector | null>(null);
  const trackerRef = useRef<Tracker | null>(null);
  const poseRef = useRef<PoseEngine | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batteryRef = useRef<any>(null);
  if (!motionRef.current) motionRef.current = new MotionDetector();
  if (!trackerRef.current) trackerRef.current = new Tracker();
  if (!poseRef.current) poseRef.current = new PoseEngine();

  useEffect(() => {
    let raf = 0;
    let disposed = false;
    let lastFrame = 0;
    let lastSync = 0;
    let lastMotionEvent = 0;
    let lastDwellTime = 0;
    let lastTrapCompute = 0;
    let poseLoading = false;
    const zonePrev = new Map<number, Set<number>>();
    let loadedDetectorId: string | null = null;
    let detectorLoading = false;
    const frameTimes: number[] = [];
    let lastDetections: RawDetection[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const navAny = navigator as any;
    if (navAny.getBattery) {
      navAny.getBattery().then((b: unknown) => (batteryRef.current = b)).catch(() => {});
    }

    async function ensureDetector(id: string) {
      if (detectorLoading) return;
      if (detectorRef.current && loadedDetectorId === id) return;
      detectorLoading = true;
      const det = createDetector(id);
      useStore.getState().setModel({ status: "loading", message: `loading ${det.label}` });
      try {
        await det.load((msg) => useStore.getState().setModel({ status: "loading", message: msg }));
        detectorRef.current?.dispose?.();
        detectorRef.current = det;
        loadedDetectorId = id;
        useStore.getState().setModel({ status: "ready", message: det.label });
        useStore.getState().addEvent({
          id: uid(),
          t: Date.now(),
          kind: "system",
          message: `Detector online — ${det.label} · ${det.backend()}`,
        });
      } catch (e) {
        det.dispose?.();
        useStore
          .getState()
          .setModel({ status: "error", message: (e as Error)?.message ?? "model load failed" });
        // Fall back to the general model if a custom model fails to load.
        if (id !== "coco-ssd") useStore.getState().setSetting("detectorId", "coco-ssd");
      } finally {
        detectorLoading = false;
      }
    }

    async function ensurePose() {
      const pose = poseRef.current!;
      if (pose.ready || poseLoading) return;
      poseLoading = true;
      try {
        await pose.load();
        useStore.getState().addEvent({
          id: uid(),
          t: Date.now(),
          kind: "system",
          message: "Limb detection online — MoveNet MultiPose",
        });
      } catch {
        /* pose is optional; keep running without it */
      } finally {
        poseLoading = false;
      }
    }

    function collectDiagnostics(): Diagnostics {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mem = (performance as any).memory;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conn = (navigator as any).connection;
      const det = detectorRef.current;
      const b = batteryRef.current;
      return {
        fps: engine.fps,
        inferenceMs: Math.round(engine.inferenceMs),
        backend: det?.backend?.() ?? "—",
        model: det?.label ?? "—",
        resolution: engine.videoW ? `${engine.videoW}×${engine.videoH}` : "—",
        heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        battery: b?.level != null ? Math.round(b.level * 100) : null,
        charging: b?.charging ?? null,
        rttMs: conn?.rtt ?? null,
        posesActive: engine.poses.length,
      };
    }

    const tick = async (ts: number) => {
      if (disposed) return;
      const st = useStore.getState();
      const video = engine.video;
      const camLive = st.camera.status === "live";
      const minInterval = 1000 / Math.max(1, st.settings.targetFps);

      if (camLive && video && video.readyState >= 2 && ts - lastFrame >= minInterval) {
        lastFrame = ts;
        const vw = (engine.videoW = video.videoWidth);
        const vh = (engine.videoH = video.videoHeight);

        if (!detectorRef.current || loadedDetectorId !== st.settings.detectorId) {
          await ensureDetector(st.settings.detectorId);
        }

        const motion = motionRef.current!.detect(video, st.settings.motionSensitivity);

        // Object detection.
        let detections = lastDetections;
        const det = detectorRef.current;
        if (det && useStore.getState().model.status === "ready") {
          const t0 = performance.now();
          try {
            const raw = await det.detect(video, st.settings.maxDetections);
            detections = raw.filter((d) => d.score >= st.settings.confidence);
            lastDetections = detections;
            engine.inferenceMs = performance.now() - t0;
          } catch {
            /* keep previous detections */
          }
        }

        // Pose / limb detection (optional).
        if (st.settings.poseEnabled) {
          if (!poseRef.current!.ready) void ensurePose();
          else {
            try {
              engine.poses = await poseRef.current!.estimate(video);
            } catch {
              /* skip this frame */
            }
          }
        } else if (engine.poses.length) {
          engine.poses = [];
        }

        const now = Date.now();
        const pestMode = st.settings.pestMode;
        const pestClasses = st.settings.pestClasses;
        const { objects, entered, exited } = trackerRef.current!.update(detections, now, {
          smoothing: st.settings.smoothing,
          minHits: 3,
          maxMissed: Math.max(4, Math.round(st.settings.targetFps * 0.8)),
          iouThreshold: 0.25,
          isPest: (cls) => pestMode && isPestClass(cls, pestClasses),
        });

        engine.objects = objects;
        engine.motion = motion;
        engine.ts = now;

        // Dwell accumulation — where activity spends time.
        const dt = lastDwellTime ? Math.min(0.5, (now - lastDwellTime) / 1000) : 0;
        lastDwellTime = now;
        if (dt > 0 && vw && vh) {
          for (const o of objects) {
            const [nx, ny] = groundPoint(o, vw, vh);
            engine.dwell.accumulate(nx, ny, dt, o.isPest ? 3 : 1);
          }
          // Off-vocabulary movement counts too (real pests won't be classified).
          for (const r of motion.regions) {
            const nx = (r.x + r.w / 2) / vw;
            const ny = (r.y + r.h) / vh;
            engine.dwell.accumulate(nx, ny, dt, Math.min(2, r.intensity * 2.5));
          }
        }

        frameTimes.push(ts);
        while (frameTimes.length && ts - frameTimes[0] > 1000) frameTimes.shift();
        engine.fps = frameTimes.length;

        const store = useStore.getState();
        for (const t of entered) {
          store.registerContact(t.class, t.isPest, objects.length);
          const [nx, ny] = groundPoint(t, vw, vh);
          engine.dwell.markIngress(nx, ny, t.isPest ? 2 : 1);
          store.addEvent({
            id: uid(),
            t: now,
            kind: t.isPest ? "pest" : "enter",
            class: t.class,
            trackId: t.id,
            message: t.isPest
              ? `Pest contact — ${pestLabel(t.class)} [#${t.id}]`
              : `${pestLabel(t.class)} entered frame [#${t.id}]`,
          });
        }
        for (const t of exited) {
          const [nx, ny] = groundPoint(t, vw, vh);
          engine.dwell.markIngress(nx, ny, 1);
          store.addEvent({
            id: uid(),
            t: now,
            kind: "exit",
            class: t.class,
            trackId: t.id,
            message: `${pestLabel(t.class)} left frame [#${t.id}]`,
          });
        }

        // Watch-zone occupancy + entry events.
        const zones = store.zones;
        const occ: Record<number, number> = {};
        if (zones.length && vw && vh) {
          for (const z of zones) {
            const inside = new Set<number>();
            for (const o of objects) {
              const cx = (o.bbox[0] + o.bbox[2] / 2) / vw;
              const cy = (o.bbox[1] + o.bbox[3] / 2) / vh;
              if (cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) inside.add(o.id);
            }
            occ[z.id] = inside.size;
            const prev = zonePrev.get(z.id) ?? new Set<number>();
            for (const o of objects) {
              if (inside.has(o.id) && !prev.has(o.id)) {
                store.addEvent({
                  id: uid(),
                  t: now,
                  kind: "zone",
                  class: o.class,
                  trackId: o.id,
                  message: `${pestLabel(o.class)} entered zone ${z.id} [#${o.id}]`,
                });
              }
            }
            zonePrev.set(z.id, inside);
          }
          for (const zid of Array.from(zonePrev.keys())) {
            if (!zones.some((z) => z.id === zid)) zonePrev.delete(zid);
          }
        } else if (zonePrev.size) {
          zonePrev.clear();
        }
        engine.zoneOcc = occ;

        if (
          motion.level > 0.06 &&
          objects.length === 0 &&
          now - lastMotionEvent > 4000 &&
          st.settings.pestMode
        ) {
          lastMotionEvent = now;
          store.addEvent({
            id: uid(),
            t: now,
            kind: "motion",
            message: `Unclassified motion — ${(motion.level * 100).toFixed(0)}% of frame`,
          });
        }
      }

      // Throttled store sync (~4Hz).
      if (ts - lastSync > 250) {
        lastSync = ts;
        const store = useStore.getState();
        store.setContacts([...engine.objects]);
        const pestCount = engine.objects.filter((o) => o.isPest).length;
        store.recordActivity(engine.objects.length, pestCount, Date.now());
        store.setDiagnostics(collectDiagnostics());
      }

      // Recompute trap suggestions every few seconds.
      if (ts - lastTrapCompute > 3000) {
        lastTrapCompute = ts;
        useStore.getState().setTrapSuggestions(computeTrapSuggestions(engine.dwell));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
