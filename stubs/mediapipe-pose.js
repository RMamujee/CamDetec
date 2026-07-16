// Stub for @mediapipe/pose. @tensorflow-models/pose-detection statically
// imports `Pose` from this package for its BlazePose-MediaPipe runtime, but
// CamDetec only uses MoveNet — that code path never executes. The real package
// ships as a global UMD script with no ESM named exports, which breaks the
// bundler, so we alias it to this stub (see turbopack.resolveAlias).
export class Pose {}
export default {};
