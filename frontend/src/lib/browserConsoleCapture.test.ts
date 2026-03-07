import { describe, expect, it } from "vitest";
import {
  buildBrowserLogPayload,
  serializeConsoleArg,
} from "./browserConsoleCapture";

describe("serializeConsoleArg", () => {
  it("serializes primitives and objects", () => {
    expect(serializeConsoleArg("hello")).toBe("hello");
    expect(serializeConsoleArg(42)).toBe("42");
    expect(serializeConsoleArg({ ok: true })).toBe('{"ok":true}');
  });

  it("handles errors and circular objects", () => {
    const err = new Error("boom");
    expect(serializeConsoleArg(err)).toContain("boom");

    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(serializeConsoleArg(circular)).toContain("[Circular]");
  });
});

describe("buildBrowserLogPayload", () => {
  it("normalizes console payloads", () => {
    const payload = buildBrowserLogPayload(
      "error",
      ["msg", { status: 500 }],
      "http://localhost:5173/",
    );

    expect(payload.level).toBe("error");
    expect(payload.href).toBe("http://localhost:5173/");
    expect(payload.args).toEqual(["msg", '{"status":500}']);
    expect(payload.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
