"use client";
import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useStore } from "./store";
import { engine } from "./engine";

/** Manages the getUserMedia stream feeding the persistent <video> element. */
export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const setCamera = useStore((s) => s.setCamera);
  const setDevices = useStore((s) => s.setDevices);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamera({ status: "idle" });
  }, [setCamera, videoRef]);

  const start = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    const { deviceId } = useStore.getState().settings;
    setCamera({ status: "requesting" });
    try {
      const video: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } };
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      streamRef.current = stream;
      v.srcObject = stream;
      await v.play();
      engine.video = v;
      engine.videoW = v.videoWidth;
      engine.videoH = v.videoHeight;
      setCamera({ status: "live", width: v.videoWidth, height: v.videoHeight, error: undefined });
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "videoinput",
      );
      setDevices(devices);
    } catch (err) {
      const e = err as { name?: string; message?: string };
      setCamera({
        status: e?.name === "NotAllowedError" ? "denied" : "error",
        error: e?.message ?? String(err),
      });
    }
  }, [videoRef, setCamera, setDevices]);

  const restart = useCallback(async () => {
    stop();
    await new Promise((r) => setTimeout(r, 120));
    await start();
  }, [stop, start]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, restart };
}
