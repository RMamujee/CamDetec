"use client";
import { useEffect, useState } from "react";
import { CONFIDENCE_MAX, CONFIDENCE_MIN, useStore } from "@/lib/store";
import { engine } from "@/lib/engine";
import { wakeLockSupported } from "@/lib/wakelock";
import { PEST_CANDIDATE_CLASSES } from "@/lib/pest";
import { LOW_LIGHT_THRESHOLD } from "@/lib/lowlight";
import { captureSnapshot } from "@/lib/snapshot";
import { fireAlert, notificationPermission, requestNotificationPermission } from "@/lib/alerts";
import type { LowLightMode } from "@/lib/types";

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`switch${on ? " on" : ""}`} onClick={onClick} aria-pressed={on}>
      <i />
    </button>
  );
}

const PERMISSION_TEXT: Record<string, string> = {
  granted: "permission granted",
  denied: "blocked — re-enable in the browser's site settings",
  default: "permission not requested yet",
  unsupported: "not supported by this browser",
};

export default function SettingsTab({
  onStart,
  onRestart,
}: {
  onStart: () => void;
  onRestart: () => void;
}) {
  const settings = useStore((s) => s.settings);
  const setSetting = useStore((s) => s.setSetting);
  const togglePestClass = useStore((s) => s.togglePestClass);
  const devices = useStore((s) => s.devices);
  const camera = useStore((s) => s.camera);
  const resetStats = useStore((s) => s.resetStats);
  const setTrapSuggestions = useStore((s) => s.setTrapSuggestions);
  const alertStatus = useStore((s) => s.alertStatus);
  const setAlertStatus = useStore((s) => s.setAlertStatus);

  // Permission is read after mount (it doesn't exist on the server) and only
  // ever *requested* from the button below.
  const [perm, setPerm] = useState<NotificationPermission | "unsupported" | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => setPerm(notificationPermission()), []);
  // Read after mount for the same reason: `navigator` doesn't exist on the server.
  const [wakeSupported, setWakeSupported] = useState(false);
  useEffect(() => setWakeSupported(wakeLockSupported()), []);

  const resetSession = () => {
    resetStats();
    engine.dwell.reset();
    setTrapSuggestions([]);
  };

  async function sendTestAlert() {
    setTesting(true);
    try {
      const video = engine.video;
      const snapshot =
        video && camera.status === "live"
          ? await captureSnapshot(video, { label: "Test alert" })
          : null;
      const status = await fireAlert(
        settings,
        {
          title: "CamDetec — test alert",
          body: `Test alert · ${new Date().toLocaleTimeString()}${
            snapshot ? " · current frame attached" : " · camera offline, text only"
          }`,
          snapshot,
        },
        { force: true },
      );
      setAlertStatus(status ?? { t: Date.now(), ok: false, text: "no alert channel enabled" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings">
      <div className="section-title" style={{ marginBottom: 16 }}>
        Settings
      </div>

      {/* Detector */}
      <div className="setgroup">
        <h3>Detector</h3>
        <div className="setrow">
          <div className="lbl">
            Object model
            <small>Runs fully in-browser via TensorFlow.js.</small>
          </div>
          <div />
          <select
            value={settings.detectorId}
            onChange={(e) => setSetting("detectorId", e.target.value as "coco-ssd" | "pest")}
          >
            <option value="coco-ssd">COCO-SSD · MobileNet v2 (80 classes)</option>
            <option value="pest">Pest model · YOLOv8 (custom)</option>
          </select>
        </div>
        <div className="note">
          <b>Pest model:</b> COCO-SSD knows general classes (person, bird, cat, dog…) but not rodents
          or insects. Train a custom YOLOv8 pest model with the free notebook in <b>training/</b>,
          drop the export into <b>public/models/pest/</b>, then select it above. If it isn't installed
          yet, the app stays on COCO-SSD and <b>motion detection</b> flags off-vocabulary pests by
          movement.
        </div>
      </div>

      {/* Detection */}
      <div className="setgroup">
        <h3>Detection</h3>
        <div className="setrow">
          <div className="lbl">
            Confidence threshold
            <small>
              Minimum score to register a detection. Applied inside the model — lower it to catch
              faint pests, raise it to cut false positives.
            </small>
          </div>
          <input
            type="range"
            min={CONFIDENCE_MIN}
            max={CONFIDENCE_MAX}
            step={0.05}
            value={settings.confidence}
            onChange={(e) => setSetting("confidence", Number(e.target.value))}
          />
          <div className="val">{Math.round(settings.confidence * 100)}%</div>
        </div>
        <div className="setrow">
          <div className="lbl">
            Tracking smoothing
            <small>Higher is steadier, slower to react.</small>
          </div>
          <input
            type="range"
            min={0}
            max={0.9}
            step={0.05}
            value={settings.smoothing}
            onChange={(e) => setSetting("smoothing", Number(e.target.value))}
          />
          <div className="val">{Math.round(settings.smoothing * 100)}%</div>
        </div>
        <div className="setrow">
          <div className="lbl">
            Limb detection
            <small>Body/skeleton tracking (MoveNet). Adds load; disable to raise FPS.</small>
          </div>
          <div />
          <Switch
            on={settings.poseEnabled}
            onClick={() => setSetting("poseEnabled", !settings.poseEnabled)}
          />
        </div>
        <div className="setrow">
          <div className="lbl">
            Low-light boost
            <small>
              Lifts the frame the model sees after dark. Saved snapshots stay raw — evidence is
              never brightened.
            </small>
          </div>
          <div />
          <select
            value={settings.lowLight}
            onChange={(e) => setSetting("lowLight", e.target.value as LowLightMode)}
          >
            <option value="auto">Auto — below {LOW_LIGHT_THRESHOLD}/255 luma</option>
            <option value="on">Always on</option>
            <option value="off">Off</option>
          </select>
        </div>
      </div>

      {/* Motion & performance */}
      <div className="setgroup">
        <h3>Motion &amp; performance</h3>
        <div className="setrow">
          <div className="lbl">
            Motion sensitivity
            <small>Flags movement even for objects the model can't classify.</small>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={settings.motionSensitivity}
            onChange={(e) => setSetting("motionSensitivity", Number(e.target.value))}
          />
          <div className="val">{Math.round(settings.motionSensitivity * 100)}%</div>
        </div>
        <div className="setrow">
          <div className="lbl">
            Target frame rate
            <small>Caps detection cadence to save battery/CPU.</small>
          </div>
          <input
            type="range"
            min={5}
            max={30}
            step={1}
            value={settings.targetFps}
            onChange={(e) => setSetting("targetFps", Number(e.target.value))}
          />
          <div className="val">{settings.targetFps} fps</div>
        </div>
      </div>

      {/* Camera */}
      <div className="setgroup">
        <h3>Camera</h3>
        <div className="setrow">
          <div className="lbl">
            Source
            <small>Mount a rear or USB camera for field use.</small>
          </div>
          <div />
          <select
            value={settings.deviceId ?? ""}
            onChange={(e) => {
              setSetting("deviceId", e.target.value || null);
              if (camera.status === "live") onRestart();
            }}
          >
            <option value="">Default (rear if available)</option>
            {devices.map((dv, i) => (
              <option key={dv.deviceId || i} value={dv.deviceId}>
                {dv.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
        <div className="setrow">
          <div className="lbl">
            Mirror image
            <small>Flip horizontally for a front-facing webcam.</small>
          </div>
          <div />
          <Switch on={settings.mirror} onClick={() => setSetting("mirror", !settings.mirror)} />
        </div>
        <div className="setrow">
          <div className="lbl">
            Keep screen awake
            <small>
              For a device left watching a room: a sleeping display suspends the detection loop.
            </small>
          </div>
          <div className="sub-line">
            {wakeSupported ? "supported by this browser" : "not supported by this browser"}
          </div>
          <Switch
            on={settings.wakeLockEnabled}
            onClick={() => setSetting("wakeLockEnabled", !settings.wakeLockEnabled)}
          />
        </div>
        <div className="setrow">
          <div className="lbl">Camera control</div>
          <div />
          {camera.status === "live" ? (
            <button className="btn" onClick={onRestart}>
              Restart
            </button>
          ) : (
            <button className="btn primary" onClick={onStart}>
              Start
            </button>
          )}
        </div>
      </div>

      {/* Pest control */}
      <div className="setgroup">
        <h3>Pest control</h3>
        <div className="setrow">
          <div className="lbl">
            Pest mode
            <small>Flag configured classes and unclassified motion as pest contacts.</small>
          </div>
          <div />
          <Switch on={settings.pestMode} onClick={() => setSetting("pestMode", !settings.pestMode)} />
        </div>
        <div style={{ padding: "12px 15px 0" }} className="eyebrow">
          Classes flagged as pests
        </div>
        <div className="chip-wrap">
          {PEST_CANDIDATE_CLASSES.map((cls) => (
            <button
              key={cls}
              className={`chip warm${settings.pestClasses.includes(cls) ? " on" : ""}`}
              style={{ textTransform: "capitalize" }}
              onClick={() => togglePestClass(cls)}
            >
              {cls}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts */}
      <div className="setgroup">
        <h3>Alerts</h3>
        <div className="setrow">
          <div className="lbl">
            Browser notification
            <small>A desktop notification the moment a pest event is confirmed.</small>
          </div>
          <div className="sub-line">
            {PERMISSION_TEXT[perm ?? "default"]}
            {/* Only "default" can still be asked — a denial has to be undone in the browser. */}
            {perm === "default" && (
              <button
                className="btn ghost"
                style={{ marginLeft: 8 }}
                onClick={() => requestNotificationPermission().then(setPerm)}
              >
                Grant permission
              </button>
            )}
          </div>
          <Switch
            on={settings.notifyEnabled}
            onClick={() => setSetting("notifyEnabled", !settings.notifyEnabled)}
          />
        </div>

        <div className="setrow">
          <div className="lbl">
            Webhook
            <small>Posts the alert — with its snapshot — straight from this browser.</small>
          </div>
          <div />
          <Switch
            on={settings.webhookEnabled}
            onClick={() => setSetting("webhookEnabled", !settings.webhookEnabled)}
          />
        </div>
        <div className="setrow">
          <div className="lbl">Destination</div>
          <div />
          <select
            value={settings.webhookKind}
            onChange={(e) => setSetting("webhookKind", e.target.value as "discord" | "telegram")}
          >
            <option value="discord">Discord webhook</option>
            <option value="telegram">Telegram bot</option>
          </select>
        </div>
        {settings.webhookKind === "discord" ? (
          <div className="setrow">
            <div className="lbl">
              Webhook URL
              <small>Channel settings → Integrations → Webhooks → Copy URL.</small>
            </div>
            <div />
            <input
              className="txt"
              type="text"
              spellCheck={false}
              placeholder="https://discord.com/api/webhooks/…"
              value={settings.discordUrl}
              onChange={(e) => setSetting("discordUrl", e.target.value)}
            />
          </div>
        ) : (
          <>
            <div className="setrow">
              <div className="lbl">
                Bot token
                <small>Issued by @BotFather.</small>
              </div>
              <div />
              <input
                className="txt"
                type="password"
                spellCheck={false}
                placeholder="123456789:AA…"
                value={settings.telegramToken}
                onChange={(e) => setSetting("telegramToken", e.target.value)}
              />
            </div>
            <div className="setrow">
              <div className="lbl">
                Chat id
                <small>The chat or channel the bot posts into.</small>
              </div>
              <div />
              <input
                className="txt"
                type="text"
                spellCheck={false}
                placeholder="-1001234567890"
                value={settings.telegramChatId}
                onChange={(e) => setSetting("telegramChatId", e.target.value)}
              />
            </div>
          </>
        )}

        <div className="setrow">
          <div className="lbl">
            Alert cooldown
            <small>Per channel. A rodent that settles in stays one alert, not a hundred.</small>
          </div>
          <input
            type="range"
            min={0}
            max={600}
            step={15}
            value={settings.alertCooldownSec}
            onChange={(e) => setSetting("alertCooldownSec", Number(e.target.value))}
          />
          <div className="val">{settings.alertCooldownSec}s</div>
        </div>
        <div className="setrow">
          <div className="lbl">
            Confirm after
            <small>
              Detections a track must accumulate before it counts. Raising this also delays
              on-screen boxes and zone counts, for every class — not just pest alerts.
            </small>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={settings.alertMinFrames}
            onChange={(e) => setSetting("alertMinFrames", Number(e.target.value))}
          />
          <div className="val">{settings.alertMinFrames} f</div>
        </div>

        <div className="setrow">
          <div className="lbl">
            Send test alert
            <small>Fires every enabled channel now, ignoring cooldowns.</small>
          </div>
          <div className={`sub-line${alertStatus && !alertStatus.ok ? " bad" : ""}`}>
            {alertStatus
              ? `${new Date(alertStatus.t).toLocaleTimeString()} — ${alertStatus.text}`
              : "no alert sent yet"}
          </div>
          <button className="btn" onClick={sendTestAlert} disabled={testing}>
            {testing ? "Sending…" : "Test"}
          </button>
        </div>
        <div className="note">
          <b>On-device only:</b> webhook URLs and bot tokens are saved in this browser&apos;s
          localStorage and posted directly to Discord/Telegram — CamDetec has no server to send
          them to. Anyone with access to this browser profile can read them.
        </div>
      </div>

      {/* Evidence */}
      <div className="setgroup">
        <h3>Evidence</h3>
        <div className="setrow">
          <div className="lbl">
            Event snapshots
            <small>
              Store an annotated JPEG for each confirmed pest event. The newest 300 are kept.
            </small>
          </div>
          <div />
          <Switch
            on={settings.snapshotsEnabled}
            onClick={() => setSetting("snapshotsEnabled", !settings.snapshotsEnabled)}
          />
        </div>
      </div>

      {/* Session */}
      <div className="setgroup">
        <h3>Session</h3>
        <div className="setrow">
          <div className="lbl">
            Reset session
            <small>Clear stats, class breakdown, dwell map, and suggestions.</small>
          </div>
          <div />
          <button className="btn danger" onClick={resetSession}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
