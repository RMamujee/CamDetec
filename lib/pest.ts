// Pest-classification logic. COCO-SSD cannot see rodents or insects, so today
// "pest" means: an animal class the general model DOES know (bird, cat, dog,
// and other critters), optionally plus intruding people. When a purpose-built
// pest model is wired in via the Detector seam, its species labels flow through
// this same predicate unchanged.

/** COCO animal classes that are meaningful for a pest / wildlife camera. */
export const PEST_CANDIDATE_CLASSES = [
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "mouse", // present as a COCO class ("computer mouse") but harmless to include
];

/** Sensible defaults for what to flag as a pest out of the box. */
export const DEFAULT_PEST_CLASSES = ["bird", "cat", "dog", "bear"];

export function isPestClass(cls: string, pestClasses: string[]): boolean {
  return pestClasses.includes(cls);
}

/** Friendly label for an event log line. */
export function pestLabel(cls: string): string {
  return cls.charAt(0).toUpperCase() + cls.slice(1);
}
