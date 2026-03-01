import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShaderManager } from "./ShaderManager";
import type { ShaderMode } from "./types";

function createMockStage() {
  return {
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
  };
}

function createMockViewer({ destroyed = false }: { destroyed?: boolean } = {}) {
  const stages: unknown[] = [];
  return {
    isDestroyed: vi.fn(() => destroyed),
    scene: {
      postProcessStages: {
        add: vi.fn((s: unknown) => stages.push(s)),
        remove: vi.fn((s: unknown) => {
          const idx = stages.indexOf(s);
          if (idx >= 0) stages.splice(idx, 1);
        }),
        _stages: stages,
      },
      requestRender: vi.fn(),
    },
  };
}

vi.mock("./nightVision", () => ({
  createNightVisionStage: vi.fn(() => createMockStage()),
}));
vi.mock("./flir", () => ({
  createFlirStage: vi.fn(() => createMockStage()),
}));
vi.mock("./crt", () => ({
  createCrtStage: vi.fn(() => createMockStage()),
}));
vi.mock("./anime", () => ({
  createAnimeStage: vi.fn(() => createMockStage()),
}));

vi.mock("cesium", () => ({
  PostProcessStage: class {},
}));

describe("ShaderManager", () => {
  let viewer: ReturnType<typeof createMockViewer>;
  let manager: ShaderManager;

  beforeEach(() => {
    vi.clearAllMocks();
    viewer = createMockViewer();
    manager = new ShaderManager(viewer as never);
  });

  it("starts in normal mode", () => {
    expect(manager.getMode()).toBe("normal");
  });

  describe("setMode", () => {
    it("switches to nightVision and adds a stage", () => {
      manager.setMode("nightVision");

      expect(manager.getMode()).toBe("nightVision");
      expect(viewer.scene.postProcessStages.add).toHaveBeenCalledTimes(1);
      expect(viewer.scene.requestRender).toHaveBeenCalled();
    });

    it("switches between non-normal modes correctly", () => {
      manager.setMode("nightVision");
      manager.setMode("flir");

      expect(manager.getMode()).toBe("flir");
      expect(viewer.scene.postProcessStages.remove).toHaveBeenCalledTimes(1);
      expect(viewer.scene.postProcessStages.add).toHaveBeenCalledTimes(2);
    });

    it("removes stage when switching back to normal", () => {
      manager.setMode("crt");
      manager.setMode("normal");

      expect(manager.getMode()).toBe("normal");
      expect(viewer.scene.postProcessStages.remove).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when setting the same mode", () => {
      manager.setMode("flir");
      vi.clearAllMocks();

      manager.setMode("flir");

      expect(viewer.scene.postProcessStages.add).not.toHaveBeenCalled();
      expect(viewer.scene.requestRender).not.toHaveBeenCalled();
    });

    it("calls requestRender after every mode change", () => {
      manager.setMode("nightVision");
      expect(viewer.scene.requestRender).toHaveBeenCalledTimes(1);

      manager.setMode("normal");
      expect(viewer.scene.requestRender).toHaveBeenCalledTimes(2);
    });

    it("skips everything when viewer is destroyed", () => {
      viewer.isDestroyed.mockReturnValue(true);

      manager.setMode("nightVision");

      expect(manager.getMode()).toBe("normal");
      expect(viewer.scene.postProcessStages.add).not.toHaveBeenCalled();
      expect(viewer.scene.requestRender).not.toHaveBeenCalled();
    });

    it("catches factory errors and still updates mode", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const { createNightVisionStage } = await import("./nightVision");
      (createNightVisionStage as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          throw new Error("GPU shader compilation failed");
        },
      );

      manager.setMode("nightVision");

      expect(manager.getMode()).toBe("nightVision");
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to activate nightVision"),
        expect.any(Error),
      );
      expect(viewer.scene.requestRender).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe("destroy", () => {
    it("removes the active stage on destroy", () => {
      manager.setMode("anime");
      manager.destroy();

      expect(viewer.scene.postProcessStages.remove).toHaveBeenCalledTimes(1);
    });

    it("is safe to call destroy with no active stage", () => {
      expect(() => manager.destroy()).not.toThrow();
    });

    it("is safe to call destroy after viewer is destroyed", () => {
      manager.setMode("crt");
      viewer.isDestroyed.mockReturnValue(true);

      expect(() => manager.destroy()).not.toThrow();
      expect(viewer.scene.postProcessStages.remove).not.toHaveBeenCalled();
    });
  });

  describe("all shader modes cycle", () => {
    const modes: ShaderMode[] = [
      "nightVision",
      "flir",
      "crt",
      "anime",
      "normal",
    ];

    it("transitions through every mode without errors", () => {
      for (const mode of modes) {
        manager.setMode(mode);
        expect(manager.getMode()).toBe(mode);
      }
    });
  });
});
