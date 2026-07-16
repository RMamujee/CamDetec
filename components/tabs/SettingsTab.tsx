"use client";
import { useStore } from "@/lib/store";
import { engine } from "@/lib/engine";
import { PEST_CANDIDATE_CLASSES } from "@/lib/pest";

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`switch${on ? " on" : ""}`} onClick={onClick} aria-pressed={on}>
      <i />
    </button>
  );
}

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

  const resetSession = () => {
    resetStats();
    engine.dwell.reset();
    setTrapSuggestions([]);
  };

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
            <small>Minimum score to register a detection.</small>
          </div>
          <input
            type="range"
            min={0.1}
            max={0.9}
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
