const LOG_ENDPOINT = "/__omx/browser-console-log";
const PATCH_FLAG = "__SEEYOU_BROWSER_CONSOLE_CAPTURE_INSTALLED__";

type BrowserLogLevel = "log" | "info" | "warn" | "error" | "debug";

interface BrowserLogPayload {
  ts: string;
  level: BrowserLogLevel | "unhandledrejection" | "windowerror";
  href: string;
  args: string[];
}

declare global {
  interface Window {
    [PATCH_FLAG]?: boolean;
  }
}

export function serializeConsoleArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }

  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  try {
    return JSON.stringify(value, createCircularReplacer());
  } catch {
    return String(value);
  }
}

export function buildBrowserLogPayload(
  level: BrowserLogPayload["level"],
  args: unknown[],
  href: string,
): BrowserLogPayload {
  return {
    ts: new Date().toISOString(),
    level,
    href,
    args: args.map(serializeConsoleArg),
  };
}

export function installBrowserConsoleCapture(): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  if (window[PATCH_FLAG]) return;
  window[PATCH_FLAG] = true;

  const methods: BrowserLogLevel[] = ["log", "info", "warn", "error", "debug"];

  for (const level of methods) {
    const original = console[level].bind(console);
    console[level] = ((...args: unknown[]) => {
      original(...args);
      sendPayload(buildBrowserLogPayload(level, args, window.location.href));
    }) as Console[typeof level];
  }

  window.addEventListener("error", (event) => {
    sendPayload(
      buildBrowserLogPayload(
        "windowerror",
        [event.message, event.filename, `line=${event.lineno}`, `col=${event.colno}`],
        window.location.href,
      ),
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    sendPayload(
      buildBrowserLogPayload(
        "unhandledrejection",
        [event.reason instanceof Error ? event.reason : serializeConsoleArg(event.reason)],
        window.location.href,
      ),
    );
  });
}

function sendPayload(payload: BrowserLogPayload): void {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const ok = navigator.sendBeacon(
      LOG_ENDPOINT,
      new Blob([body], { type: "application/json" }),
    );
    if (ok) return;
  }

  void fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function createCircularReplacer() {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown) => {
    if (typeof value !== "object" || value === null) return value;
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value;
  };
}
