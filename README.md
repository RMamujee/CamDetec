# CamDetec — Tactical Detection Console

In-browser, privacy-first motion & object detection. Your webcam feed **never
leaves the device** — all inference runs locally via TensorFlow.js. Built toward
**pest / wildlife camera monitoring**: point a camera at a doorway, garden, or
feeder and let it watch.

## What it does

- **Live detection** — COCO-SSD (MobileNet v2) object detection with IoU
  **object tracking + temporal smoothing** for stable boxes, stable IDs, and
  enter/exit events (a big accuracy/feel upgrade over raw per-frame detection).
- **Motion detection** — model-free frame-differencing that flags *where*
  something is moving, even for objects the classifier has never seen. This is
  the honest, working core of pest detection today.
- **Tabbed HUD** — Live, 3D spatial map, Events, Diagnostics, Settings. Overlays
  are toggle chips on the top bar and side rail, not a fixed wall of stats.
- **3D view** — a maximized spatial map that places contacts and motion zones on
  a floor grid relative to the camera's field of view.
- **Pest mode** — flags configured classes (and unclassified motion) as pest
  contacts, logs them with timestamps, and surfaces them across the UI.

## Pest control roadmap

COCO-SSD knows ~80 general classes (person, bird, cat, dog…) but **not** rodents
or insects. Species-level pest ID needs a purpose-built model. The detector is a
**swappable module** (`lib/detector.ts` → `Detector` interface) so that model
drops in without touching the tracker, motion engine, or UI. Until then, motion
detection covers off-vocabulary pests by movement.

## Architecture

```
lib/
  detector.ts        pluggable Detector interface + COCO-SSD implementation
  motion.ts          frame-differencing motion detector (grid + regions)
  tracker.ts         greedy IoU tracker with EMA smoothing
  pest.ts            pest-class predicate + defaults
  engine.ts          hot-path state shared with render loops (outside React)
  store.ts           zustand store (UI state + throttled snapshots)
  useCamera.ts       getUserMedia lifecycle
  useDetectionLoop.ts  the rAF loop that drives everything
components/
  hud/               TopBar, DetectionOverlay (live canvas), ToggleChip
  tabs/              Live, Spatial (3D), Events, Diagnostics, Settings
  three/             SpatialView (react-three-fiber)
```

Per-frame data lives in `engine` (a plain module singleton) so the render loops
read it every rAF without triggering React re-renders. Only low-frequency
snapshots (contacts, stats, diagnostics) flow through the store.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000 — allow camera access
npm run build
```

Stack: Next.js 16 (App Router, fully client-side page), React 19, TensorFlow.js,
three.js / react-three-fiber, zustand.
