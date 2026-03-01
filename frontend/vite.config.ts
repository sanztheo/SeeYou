/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), cesium(), tailwindcss()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
