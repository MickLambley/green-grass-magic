/// <reference types="vite/client" />

// Google Maps types - re-declare from @types/google.maps
// The package uses a dotted name which TypeScript can't resolve via "types" config
import "@types/google.maps";

declare namespace NodeJS {
  interface Timeout {}
}
