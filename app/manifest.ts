import type { MetadataRoute } from "next";

/**
 * Installable-app metadata, so an old phone can be set up as a dedicated
 * monitor: install to the home screen, open it standalone, point it at the
 * kitchen. Next injects the <link rel="manifest"> for this route itself.
 *
 * Icons are the same SVG the browser tab uses. Chrome has accepted a single
 * `sizes: "any"` vector icon for installability since it dropped the PNG
 * requirement, and one scalable glyph beats two rasterised approximations.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CamDetec",
    short_name: "CamDetec",
    description:
      "In-browser camera monitoring for pest & wildlife activity. Nothing leaves your device.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    // Matches --ink in globals.css, so the splash and shell don't flash.
    background_color: "#0e1315",
    theme_color: "#0e1315",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
    ],
  };
}
