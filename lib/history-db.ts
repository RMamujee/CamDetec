// Persistent event history for CamDetec.
//
// The store keeps only the last ~400 events in memory and loses them on reload.
// This IndexedDB layer durably records every event so activity survives reloads
// and can be exported to CSV/JSON for tracking a location over days. It is a thin
// wrapper — no dependencies — and every call is a no-op during SSR.

import type { EventRecord } from "./types";

const DB_NAME = "camdetec";
const STORE = "events";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIDB() {
  return typeof indexedDB !== "undefined";
}

function openDB(): Promise<IDBDatabase> {
  if (!hasIDB()) return Promise.reject(new Error("IndexedDB unavailable"));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("t", "t", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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

export async function exportEventsJson(): Promise<number> {
  const rows = await getAllEvents();
  download(
    new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }),
    `camdetec-events-${stamp()}.json`,
  );
  return rows.length;
}
