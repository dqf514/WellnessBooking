import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 38733,
    strictPort: true,
    host: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:38734", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:38734", changeOrigin: true },
    },
  },
  preview: {
    port: 38735,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:38734", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:38734", changeOrigin: true },
    },
  },
});
