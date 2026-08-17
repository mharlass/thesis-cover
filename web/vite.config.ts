import { defineConfig } from "vite";

// The app is served from https://mharlass.github.io/thesis-cover/, so asset
// URLs have to be relative rather than rooted at the domain.
//
// JSX is configured in tsconfig.json (`jsx: react-jsx`, `jsxImportSource:
// preact`) and Vite's transformer reads it from there, so there is nothing to
// repeat here — setting it twice only earns a warning about which one wins.
export default defineConfig({
  base: "./",
  build: {
    outDir: "../_site",
    emptyOutDir: true,
    // Keep the size report honest about what a first visit actually costs.
    reportCompressedSize: true,
  },
});
