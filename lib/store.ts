import { create } from "zustand";
import type {
  ActivityBucket,
  CameraStatus,
  Diagnostics,
  EventRecord,
  ModelStatus,
  OverlayFlags,
  Settings,
  TabId,
  TrackedObject,
  TrapSuggestion,
  Zone,
} from "./types";
import { DEFAULT_PEST_CLASSES } from "./pest";

const ACTIVITY_BUCKET_MS = 15_000; // 15s buckets
const ACTIVITY_MAX = 60; // -> 15 minutes of history
const EVENTS_MAX = 400;
const ZONES_KEY = "camdetec.zones.v1";

function loadZones(): Zone[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(ZONES_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (z) => z && [z.x, z.y, z.w, z.h].every((n) => typeof n === "number") && z.w > 0 && z.h > 0,
    );
  } catch {
    return [];
  }
}

function saveZones(zones: Zone[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ZONES_KEY, JSON.stringify(zones));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

interface Stats {
  perClass: Record<string, number>;
  totalContacts: number;
  pestContacts: number;
  peakConcurrent: number;
  sessionStart: number;
}

interface Store {
  activeTab: TabId;
  setActiveTab: (t: TabId) => void;

  overlays: OverlayFlags;
  toggleOverlay: (key: keyof OverlayFlags) => void;

  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  togglePestClass: (cls: string) => void;

  camera: { status: CameraStatus; error?: string; width: number; height: number };
  setCamera: (patch: Partial<Store["camera"]>) => void;
  devices: MediaDeviceInfo[];
  setDevices: (d: MediaDeviceInfo[]) => void;

  model: { status: ModelStatus; message: string };
  setModel: (patch: Partial<Store["model"]>) => void;

  contacts: TrackedObject[];
  setContacts: (c: TrackedObject[]) => void;

  events: EventRecord[];
  addEvent: (e: EventRecord) => void;
  clearEvents: () => void;

  stats: Stats;
  registerContact: (cls: string, isPest: boolean, concurrent: number) => void;
  resetStats: () => void;

  activity: ActivityBucket[];
  recordActivity: (count: number, pest: number, now: number) => void;

  diagnostics: Diagnostics;
  setDiagnostics: (d: Diagnostics) => void;

  trapSuggestions: TrapSuggestion[];
  setTrapSuggestions: (t: TrapSuggestion[]) => void;

  zones: Zone[];
  addZone: (z: Omit<Zone, "id">) => void;
  removeZone: (id: number) => void;
  clearZones: () => void;
}

const initialOverlays: OverlayFlags = {
  boxes: true,
  labels: true,
  ids: true,
  confidence: true,
  motionHeat: false,
  trails: true,
  reticles: false,
  skeleton: true,
};

const initialSettings: Settings = {
  detectorId: "coco-ssd",
  confidence: 0.5,
  motionSensitivity: 0.6,
  targetFps: 20,
  pestMode: true,
  pestClasses: [...DEFAULT_PEST_CLASSES],
  poseEnabled: true,
  mirror: true,
  deviceId: null,
  maxDetections: 20,
  smoothing: 0.6,
};

const initialStats = (): Stats => ({
  perClass: {},
  totalContacts: 0,
  pestContacts: 0,
  peakConcurrent: 0,
  sessionStart: Date.now(),
});

export const useStore = create<Store>((set) => ({
  activeTab: "live",
  setActiveTab: (t) => set({ activeTab: t }),

  overlays: initialOverlays,
  toggleOverlay: (key) =>
    set((s) => ({ overlays: { ...s.overlays, [key]: !s.overlays[key] } })),

  settings: initialSettings,
  setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
  togglePestClass: (cls) =>
    set((s) => {
      const has = s.settings.pestClasses.includes(cls);
      return {
        settings: {
          ...s.settings,
          pestClasses: has
            ? s.settings.pestClasses.filter((c) => c !== cls)
            : [...s.settings.pestClasses, cls],
        },
      };
    }),

  camera: { status: "idle", width: 0, height: 0 },
  setCamera: (patch) => set((s) => ({ camera: { ...s.camera, ...patch } })),
  devices: [],
  setDevices: (d) => set({ devices: d }),

  model: { status: "idle", message: "standby" },
  setModel: (patch) => set((s) => ({ model: { ...s.model, ...patch } })),

  contacts: [],
  setContacts: (c) => set({ contacts: c }),

  events: [],
  addEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, EVENTS_MAX) })),
  clearEvents: () => set({ events: [] }),

  stats: initialStats(),
  registerContact: (cls, isPest, concurrent) =>
    set((s) => {
      const perClass = { ...s.stats.perClass, [cls]: (s.stats.perClass[cls] ?? 0) + 1 };
      return {
        stats: {
          ...s.stats,
          perClass,
          totalContacts: s.stats.totalContacts + 1,
          pestContacts: s.stats.pestContacts + (isPest ? 1 : 0),
          peakConcurrent: Math.max(s.stats.peakConcurrent, concurrent),
        },
      };
    }),
  resetStats: () => set({ stats: initialStats() }),

  activity: [],
  recordActivity: (count, pest, now) =>
    set((s) => {
      const bucketT = Math.floor(now / ACTIVITY_BUCKET_MS) * ACTIVITY_BUCKET_MS;
      const last = s.activity[s.activity.length - 1];
      if (last && last.t === bucketT) {
        const updated = [...s.activity];
        updated[updated.length - 1] = {
          t: bucketT,
          count: Math.max(last.count, count),
          pest: Math.max(last.pest, pest),
        };
        return { activity: updated };
      }
      const next = [...s.activity, { t: bucketT, count, pest }];
      return { activity: next.slice(-ACTIVITY_MAX) };
    }),

  diagnostics: {
    fps: 0,
    inferenceMs: 0,
    backend: "—",
    model: "—",
    resolution: "—",
    heapMB: null,
    battery: null,
    charging: null,
    rttMs: null,
    posesActive: 0,
  },
  setDiagnostics: (d) => set({ diagnostics: d }),

  trapSuggestions: [],
  setTrapSuggestions: (t) => set({ trapSuggestions: t }),

  zones: loadZones(),
  addZone: (z) =>
    set((s) => {
      const id = s.zones.reduce((m, x) => Math.max(m, x.id), 0) + 1;
      const zones = [...s.zones, { ...z, id }];
      saveZones(zones);
      return { zones };
    }),
  removeZone: (id) =>
    set((s) => {
      const zones = s.zones.filter((z) => z.id !== id);
      saveZones(zones);
      return { zones };
    }),
  clearZones: () =>
    set(() => {
      saveZones([]);
      return { zones: [] };
    }),
}));
