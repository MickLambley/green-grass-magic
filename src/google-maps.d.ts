// Ambient type declarations for Google Maps API
// @types/google.maps uses a dotted package name which TypeScript's
// moduleDetection: "force" can't resolve automatically.

/* eslint-disable @typescript-eslint/no-namespace */
declare namespace google {
  // Re-export from @types/google.maps
  export import maps = __google_maps;
}

// Pull in the actual types under a different name to avoid module scoping issues
declare const __google_maps: typeof import("@types/google.maps");
