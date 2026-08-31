// Persistent event history for CamDetec.
//
// The store keeps only the last ~400 events in memory and loses them on reload.
// This IndexedDB layer durably records every event so activity survives reloads
// and can be exported to CSV/JSON for tracking a location over days. It is a thin
// wrapper — no dependencies — and every call is a no-op during SSR.

import type { EventRecord } from "./types";

const DB_NAME = "camdetec";
const STORE = "events";
const SNAP_STORE = "snapshots";
const DB_VERSION = 2;
/** Snapshots are the only heavy rows — cap them so history stays bounded. */
const SNAPSHOT_MAX = 300;

/** One evidence image, keyed by the id of the event it belongs to. */
interface SnapshotRecord {
  id: string;
  t: number;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIDB() {
  return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  if (!hasIDB()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // v1 -> v2 adds the snapshot store. Both branches are guarded by name, so a
    // fresh database and an upgraded one end up identical and the `events` rows
    // an existing install already holds are never read, rewritten, or dropped.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("t", "t", { unique: false });
      }
      if (!db.objectStoreNames.contains(SNAP_STORE)) {
        const snaps = db.createObjectStore(SNAP_STORE, { keyPath: "id" });
        snaps.createIndex("t", "t", { unique: false });
      }
    };
    // Another tab still holding v1 open would otherwise stall this forever.
    req.onblocked = () => reject(new Error("history upgrade blocked by another tab"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // Don't cache a failure: a later call (other tab closed) should get a fresh try.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Fire-and-forget write of one event. Safe to call from the store on every event. */
export function persistEvent(e: EventRecord): void {
  if (!hasIDB()) return;
  openDB()
    .then((db) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(e);
    })
    .catch(() => {});
}

/** Most-recent `limit` events, newest first (matches the store's ordering). */
export async function getRecentEvents(limit = 400): Promise<EventRecord[]> {
  if (!hasIDB()) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const cursorReq = tx.objectStore(STORE).index("t").openCursor(null, "prev");
    const out: EventRecord[] = [];
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (c && out.length < limit) {
        out.push(c.value as EventRecord);
        c.continue();
      } else {
        resolve(out);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/** Every stored event, oldest → newest (for export). */
export async function getAllEvents(): Promise<EventRecord[]> {
  if (!hasIDB()) return [];
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("t").getAll();
    req.onsuccess = () => resolve(req.result as EventRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function countEvents(): Promise<number> {
  if (!hasIDB()) return 0;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearHistory(): Promise<void> {
  if (!hasIDB()) return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE, SNAP_STORE], "readwrite");
    tx.objectStore(STORE).clear();
    tx.objectStore(SNAP_STORE).clear(); // images go with the events they document
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- evidence snapshots ---------- */

/**
 * Fire-and-forget write of one event's snapshot, then a prune. Events written
 * before this feature existed simply have no row here, which every reader
 * treats as "no image".
 *
 * `onError` matters: a full disk or a blocked upgrade would otherwise drop
 * evidence silently while the Settings toggle still reads ON.
 */
export function putSnapshot(
  id: string,
  t: number,
  blob: Blob,
  onError?: (reason: string) => void,
): void {
  if (!hasIDB()) {
    onError?.("IndexedDB unavailable");
    return;
  }
  openDB()
    .then(async (db) => {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SNAP_STORE, "readwrite");
        tx.objectStore(SNAP_STORE).put({ id, t, blob } satisfies SnapshotRecord);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await pruneSnapshots(db);
    })
    .catch((e) => onError?.((e as Error)?.message ?? "IndexedDB write failed"));
}

/**
 * Evict oldest-first back down to the cap, then sweep orphans — images whose
 * event row is gone. Only the image is ever deleted; the event it documents
 * stays in the log. Runs only when we are actually over the cap, so the sweep's
 * one key lookup per surviving image is paid at most once per new snapshot.
 */
function pruneSnapshots(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE, SNAP_STORE], "readwrite");
    const snaps = tx.objectStore(SNAP_STORE);
    const events = tx.objectStore(STORE);
    // Primary keys in time order, oldest first — no cursor to keep alive.
    const keysReq = snaps.index("t").getAllKeys();
    keysReq.onsuccess = () => {
      const keys = keysReq.result as string[];
      const excess = keys.length - SNAPSHOT_MAX;
      if (excess <= 0) return; // under the cap; tx completes below
      for (const k of keys.slice(0, excess)) snaps.delete(k);
      for (const k of keys.slice(excess)) {
        const req = events.getKey(k);
        req.onsuccess = () => {
          if (req.result === undefined) snaps.delete(k);
        };
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** The snapshot for an event, or null when it has none. */
export async function getSnapshot(id: string): Promise<Blob | null> {
  if (!hasIDB()) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAP_STORE, "readonly");
    const req = tx.objectStore(SNAP_STORE).get(id);
    req.onsuccess = () => resolve((req.result as SnapshotRecord | undefined)?.blob ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function getAllSnapshots(): Promise<Map<string, Blob>> {
  if (!hasIDB()) return new Map();
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAP_STORE, "readonly");
    const req = tx.objectStore(SNAP_STORE).getAll();
    req.onsuccess = () =>
      resolve(new Map((req.result as SnapshotRecord[]).map((r) => [r.id, r.blob])));
    req.onerror = () => reject(req.error);
  });
}

/* ---------- export ---------- */

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: string | number | undefined): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

export async function exportEventsCsv(): Promise<number> {
  const rows = await getAllEvents();
  const header = ["iso_time", "epoch_ms", "kind", "class", "track_id", "message"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(new Date(r.t).toISOString()),
        csvCell(r.t),
        csvCell(r.kind),
        csvCell(r.class),
        csvCell(r.trackId),
        csvCell(r.message),
      ].join(","),
    );
  }
  download(new Blob([lines.join("\n")], { type: "text/csv" }), `camdetec-events-${stamp()}.csv`);
  return rows.length;
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/**
 * JSON export. Images are opt-in: base64 inflates the file by ~4/3 of every
 * stored JPEG, which is easily tens of megabytes.
 */
export async function exportEventsJson(includeImages = false): Promise<number> {
  const rows = await getAllEvents();
  let payload: unknown = rows;
  if (includeImages) {
    const snaps = await getAllSnapshots();
    payload = await Promise.all(
      rows.map(async (r) => {
        const b = snaps.get(r.id);
        if (!b) return r;
        return { ...r, snapshot: { mime: b.type || "image/jpeg", base64: await blobToBase64(b) } };
      }),
    );
  }
  download(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    `camdetec-events-${stamp()}.json`,
  );
  return rows.length;
}
