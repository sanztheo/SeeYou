/// <reference types="vitest/config" />
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";
import tailwindcss from "@tailwindcss/vite";

function frontendBrowserConsolePlugin() {
  const rootDir = __dirname;
  const logDir = path.resolve(rootDir, "../.omx/logs/runtime/frontend-browser");
  const fileName = `frontend-browser-${new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\.\d{3}Z$/, "Z")}.log`;
  const logFile = path.join(logDir, fileName);
  const latestPath = path.join(logDir, "latest.log");

  fs.mkdirSync(logDir, { recursive: true });
  try {
    fs.rmSync(latestPath, { force: true });
  } catch {
    // ignore
  }
  try {
    fs.symlinkSync(fileName, latestPath);
  } catch {
    // ignore
  }

  return {
    name: "frontend-browser-console-log",
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            req: NodeJS.ReadableStream & { method?: string; url?: string },
            res: {
              statusCode: number;
              end: (body?: string) => void;
              setHeader: (name: string, value: string) => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      console.log(`[frontend-browser] console logs -> ${logFile}`);

      server.middlewares.use((req, res, next) => {
        if (req.method !== "POST" || req.url !== "/__omx/browser-console-log") {
          next();
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body) as {
              ts?: string;
              level?: string;
              href?: string;
              args?: string[];
            };
            const line = `[${payload.ts ?? new Date().toISOString()}] [${
              payload.level ?? "log"
            }] [${payload.href ?? ""}] ${(payload.args ?? []).join(" | ")}\n`;
            fs.appendFileSync(logFile, line);
            res.statusCode = 204;
            res.end();
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "text/plain");
            res.end("invalid browser console payload");
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cesium(), tailwindcss(), frontendBrowserConsolePlugin()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
