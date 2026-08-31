// Low-light boost for the inference input.
//
// A pest camera earns its keep at night, and that is exactly when a webcam
// frame collapses into noise the detector can't read. This lifts the frame the
// model sees — never the frame we store. Evidence snapshots stay raw so a
// recorded sighting is always what the camera actually saw.
//
// tf.js is loaded lazily by the detectors, so the runtime arrives here as an
// untyped module handle; every helper takes it as a parameter.
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { LowLightMode } from "./types";

/** Mean luma (0..255) below which "auto" turns the boost on. */
export const LOW_LIGHT_THRESHOLD = 60;
/** < 1 lifts shadows; the mild stretch restores the contrast gamma flattens. */
const GAMMA = 0.6;
const CONTRAST = 1.15;
/** Luma is measured on a tiny resample — a full-frame reduction isn't worth it. */
const SAMPLE = 32;
const LUMA_WEIGHTS = [0.299, 0.587, 0.114];

/**
 * What the frame path decided on the last inference, for the diagnostics
 * readout. Hot-path state, like `engine` — never write it from React.
 */
export const lowLightState: { active: boolean; luma: number | null } = {
  active: false,
  luma: null,
};

/** Mean luma 0..255 of a float 0..1 image tensor, without leaving the GPU path. */
export function tensorLuma(tf: any, x: any): number {
  return tf.tidy(() => {
    const small = tf.image.resizeBilinear(x, [SAMPLE, SAMPLE]);
    return (small.mul(LUMA_WEIGHTS).sum(-1).mean().dataSync()[0] as number) * 255;
  });
}

let sampleCanvas: HTMLCanvasElement | null = null;

/** Mean luma 0..255 sampled from a small canvas — for detectors fed the video element. */
export function canvasLuma(video: HTMLVideoElement): number | null {
  if (typeof document === "undefined" || !video.videoWidth) return null;
  const c = (sampleCanvas ??= document.createElement("canvas"));
  c.width = SAMPLE;
  c.height = SAMPLE;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, SAMPLE, SAMPLE);
  const d = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    sum += LUMA_WEIGHTS[0] * d[i] + LUMA_WEIGHTS[1] * d[i + 1] + LUMA_WEIGHTS[2] * d[i + 2];
  }
  return sum / (d.length / 4);
}

/** Decide whether to boost, and publish the decision for the HUD. */
export function decideLowLight(mode: LowLightMode, luma: number | null): boolean {
  const active = mode === "on" || (mode === "auto" && luma != null && luma < LOW_LIGHT_THRESHOLD);
  lowLightState.active = active;
  lowLightState.luma = luma;
  return active;
}

/** Gamma lift + contrast stretch on a float 0..1 tensor. Call inside a tidy. */
export function boostLowLight(x: any): any {
  return x.pow(GAMMA).sub(0.5).mul(CONTRAST).add(0.5).clipByValue(0, 1);
}
