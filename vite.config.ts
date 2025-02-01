import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    lib: {
      entry: "src/index.ts", // Entry point for your GitHub Action
      formats: ["cjs"], // CommonJS format for Node.js compatibility
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["@actions/core", "@actions/github"], // Keep GitHub Actions APIs external
    },
    minify: false, // Disable minification for better debugging
  },
});