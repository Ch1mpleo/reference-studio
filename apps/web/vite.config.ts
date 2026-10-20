import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const servicePort = process.env.REFERENCE_STUDIO_PORT ?? "4317";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@reference-studio/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${servicePort}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
