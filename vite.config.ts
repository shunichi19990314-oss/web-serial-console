import { defineConfig } from "vite";

// Relative base keeps the production build portable: works on GitHub Pages
// project sites, Render static hosting, or any sub-path.
export default defineConfig({
  base: "./",
  build: { sourcemap: true, target: "es2022" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
