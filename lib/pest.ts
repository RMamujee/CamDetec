// Pest-classification logic. COCO-SSD cannot see rodents or insects, so today
// "pest" means: an animal class the general model DOES know (bird, cat, dog,
// and other critters), optionally plus intruding people. When a purpose-built
// pest model is wired in via the Detector seam, its species labels flow through
// this same predicate unchanged.

/**
 * Classes meaningful for a pest / wildlife camera. Includes the custom pest
 * model's labels (rodent, rat, cockroach …) plus the COCO animal classes that
 * apply when COCO-SSD is the active detector.
 */
export const PEST_CANDIDATE_CLASSES = [
  "rodent",
  "rat",
  "mouse",
  "cockroach",
  "raccoon",
  "opossum",
  "squirrel",
  "bird",
  "cat",
  "dog",
  "bear",
];

/**
 * Sensible defaults for what to flag as a pest out of the box. "mouse" is left
 * off by default because COCO-SSD's "mouse" is a computer mouse (false
 * positives); the custom rodent model emits "rodent"/"rat" instead.
 */
export const DEFAULT_PEST_CLASSES = ["rodent", "rat", "raccoon", "opossum", "bird", "cat", "dog"];

export function isPestClass(cls: string, pestClasses: string[]): boolean {
  return pestClasses.includes(cls);
}

/** Friendly label for an event log line. */
export function pestLabel(cls: string): string {
  return cls.charAt(0).toUpperCase() + cls.slice(1);
}
