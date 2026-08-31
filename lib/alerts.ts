// Alert delivery for confirmed pest events.
//
// Two independent channels, both driven from the browser — this app has no
// server and isn't getting one. Each channel keeps its own cooldown so a rodent
// that settles in front of the lens produces one alert, not a hundred.
//
// Webhook posts use multipart/form-data on purpose: it is a CORS "simple
// request", so the browser sends it without a preflight that Discord and
// Telegram would not answer. Both APIs accept their fields that way.

import type { Settings } from "./types";

export interface AlertMessage {
  title: string;
  body: string;
  /** Evidence image, attached when one was captured for this event. */
  snapshot?: Blob | null;
}

/** Result of one delivery attempt, surfaced in Settings. Never thrown. */
export interface AlertStatus {
  t: number;
  ok: boolean;
  text: string;
}

type Channel = "notify" | "webhook";

/**
 * Outcome of one channel. `delivered` is false for a skip (no permission, no
 * URL) as well as a failure — an enabled channel that sent nothing is not a
 * success, however undramatic the reason.
 */
interface Delivery {
  delivered: boolean;
  text: string;
}

const lastFired: Record<Channel, number> = { notify: 0, webhook: 0 };

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/** Asked for from a Settings button only — never on page load. */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

async function sendNotification(msg: AlertMessage): Promise<Delivery> {
  if (typeof Notification === "undefined") {
    return { delivered: false, text: "notifications unsupported" };
  }
  // Denied is a decision, not a crash — degrade quietly, but don't call it sent.
  if (Notification.permission !== "granted") {
    return { delivered: false, text: "notifications not permitted" };
  }
  const url = msg.snapshot ? URL.createObjectURL(msg.snapshot) : undefined;
  const n = new Notification(msg.title, { body: msg.body, icon: url, tag: "camdetec-alert" });
  if (url) {
    const revoke = () => URL.revokeObjectURL(url);
    n.addEventListener("close", revoke);
    setTimeout(revoke, 60_000);
  }
  return { delivered: true, text: "notified" };
}

async function sendWebhook(s: Settings, msg: AlertMessage): Promise<Delivery> {
  const fd = new FormData();

  if (s.webhookKind === "discord") {
    const url = s.discordUrl.trim();
    if (!url) return { delivered: false, text: "discord webhook URL missing" };
    fd.append(
      "payload_json",
      JSON.stringify({ username: "CamDetec", content: `**${msg.title}**\n${msg.body}` }),
    );
    if (msg.snapshot) fd.append("files[0]", msg.snapshot, "snapshot.jpg");
    const res = await fetch(url, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`discord HTTP ${res.status}`);
    return { delivered: true, text: "sent to Discord" };
  }

  const token = s.telegramToken.trim();
  const chat = s.telegramChatId.trim();
  if (!token || !chat) return { delivered: false, text: "telegram token/chat id missing" };
  const text = `${msg.title}\n${msg.body}`;
  fd.append("chat_id", chat);
  const method = msg.snapshot ? "sendPhoto" : "sendMessage";
  if (msg.snapshot) {
    fd.append("caption", text);
    fd.append("photo", msg.snapshot, "snapshot.jpg");
  } else {
    fd.append("text", text);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(`telegram HTTP ${res.status}`);
  return { delivered: true, text: "sent to Telegram" };
}

/**
 * Deliver `msg` on every enabled channel that is out of cooldown.
 * Returns null when nothing was attempted (all channels off or cooling down);
 * otherwise an aggregate status for the UI. Never throws — a dead webhook must
 * not take the detection loop with it.
 *
 * `force` (the Settings test button) ignores cooldowns and leaves them
 * untouched, so testing never mutes the next real sighting.
 */
export async function fireAlert(
  s: Settings,
  msg: AlertMessage,
  opts: { force?: boolean } = {},
): Promise<AlertStatus | null> {
  const now = Date.now();
  const cooldownMs = Math.max(0, s.alertCooldownSec) * 1000;
  const ready = (c: Channel) => opts.force || now - lastFired[c] >= cooldownMs;

  const jobs: Array<Promise<Delivery>> = [];
  if (s.notifyEnabled && ready("notify")) {
    // Claim the cooldown before awaiting so a burst of events can't slip through.
    if (!opts.force) lastFired.notify = now;
    jobs.push(sendNotification(msg));
  }
  if (s.webhookEnabled && ready("webhook")) {
    if (!opts.force) lastFired.webhook = now;
    jobs.push(sendWebhook(s, msg));
  }
  if (jobs.length === 0) return null;

  const settled = await Promise.allSettled(jobs);
  const parts: Delivery[] = settled.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { delivered: false, text: `failed — ${errText(r.reason)}` },
  );
  // Only a clean sweep reads as success: a channel the user switched on that
  // delivered nothing is exactly what this line exists to show.
  return {
    t: Date.now(),
    ok: parts.every((p) => p.delivered),
    text: parts.map((p) => p.text).join(" · "),
  };
}

function errText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // A CORS/offline rejection has no useful message; say something honest.
  return m === "Failed to fetch" ? "network or CORS blocked" : m;
}
