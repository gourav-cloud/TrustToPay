import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
    css: false,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
      "/health": {
        target: "http://localhost:3000",
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep rarely-changing vendors in their own long-lived chunks instead of
        // one oversized bundle that is re-downloaded on every app change.
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, "/");
          if (!moduleId.includes("node_modules/")) return undefined;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run)\//.test(moduleId)) {
            return "react-vendor";
          }
          if (moduleId.includes("node_modules/@tanstack/")) return "query-vendor";
          if (
            /node_modules\/(recharts|recharts-scale|victory-vendor|react-smooth|d3-[a-z-]+|lodash|lodash-es|eventemitter3|react-is|tiny-invariant|decimal\.js-light|internmap|fast-equals|prop-types|react-transition-group|dom-helpers)\//.test(
              moduleId,
            )
          ) {
            return "charts-vendor";
          }
          if (moduleId.includes("node_modules/@radix-ui/")) return "radix-vendor";
          if (moduleId.includes("node_modules/lucide-react/")) return "icons-vendor";
          return "vendor";
        },
      },
    },
  },
});
