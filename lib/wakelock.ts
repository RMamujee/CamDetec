// Screen Wake Lock — for the dedicated-device case: an old phone propped up
// facing the kitchen, running CamDetec all night. The display sleeping stops
// the rAF loop, which stops detection, so the lock is held for exactly as long
// as the camera is live and the setting is on.
//
// The lock is dropped by the browser whenever the tab is hidden, so it has to
// be re-taken on the way back to visible. Everything here fails silently:
// Safari and Firefox have no wakeLock at all, and losing it degrades the app
// rather than breaking it.

/** Mirrors the live lock state for the Diagnostics tile (read, never written, by UI). */
export const wakeLockState = { active: false };

interface Sentinel {
  release(): Promise<void>;
  addEventListener(type: "release", handler: () => void): void;
}

let sentinel: Sentinel | null = null;
/** What the app wants, independent of what the browser has granted right now. */
let wanted = false;
let listening = false;
/**
 * A request is in flight. `sentinel` is still null for its whole duration, so
 * without this a second caller — a visibilitychange, or the settings toggle
 * flicked off and on — starts a second request, and whichever lands first is
 * overwritten and never released: the screen then stays awake until the page
 * unloads, with nothing left holding a reference to switch it off.
 */
let acquiring = false;

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

async function acquire(): Promise<void> {
  if (!wanted || sentinel || acquiring || !wakeLockSupported()) return;
  // A request while hidden is rejected by spec — wait for visibilitychange.
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  acquiring = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: Sentinel = await (navigator as any).wakeLock.request("screen");
    // The camera may have stopped while this was in flight.
    if (!wanted) {
      void s.release().catch(() => {});
      return;
    }
    sentinel = s;
    wakeLockState.active = true;
    s.addEventListener("release", () => {
      if (sentinel !== s) return;
      sentinel = null;
      wakeLockState.active = false;
    });
  } catch {
    wakeLockState.active = false;
  } finally {
    acquiring = false;
  }
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") void acquire();
}

/** Hold the screen awake. Idempotent; safe to call when unsupported. */
export function requestWakeLock(): void {
  if (!wakeLockSupported()) return;
  wanted = true;
  if (!listening) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    listening = true;
  }
  void acquire();
}

/** Let the screen sleep again. Idempotent. */
export function releaseWakeLock(): void {
  wanted = false;
  wakeLockState.active = false;
  if (listening) {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    listening = false;
  }
  const s = sentinel;
  sentinel = null;
  void s?.release().catch(() => {});
}
