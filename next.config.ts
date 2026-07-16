import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root. A stray ~/package-lock.json on this machine has
  // hijacked Next's root-detection before and broken the build; forcing the
  // root to this folder makes turbopack ignore it.
  turbopack: {
    root: path.resolve("."),
    // pose-detection statically imports @mediapipe/pose (BlazePose runtime we
    // don't use); it has no ESM exports and breaks the bundler. Alias to a stub.
    resolveAlias: {
      "@mediapipe/pose": "./stubs/mediapipe-pose.js",
    },
  },
};

export default nextConfig;
