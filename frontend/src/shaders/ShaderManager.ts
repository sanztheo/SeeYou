import { PostProcessStage } from "cesium";
import type { Viewer } from "cesium";
import type { ShaderMode } from "./types";
import { createNightVisionStage } from "./nightVision";
import { createFlirStage } from "./flir";
import { createCrtStage } from "./crt";
import { createAnimeStage } from "./anime";

type StageFactory = (viewer: Viewer) => PostProcessStage;

const STAGE_FACTORIES: Record<Exclude<ShaderMode, "normal">, StageFactory> = {
  nightVision: createNightVisionStage,
  flir: createFlirStage,
  crt: createCrtStage,
  anime: createAnimeStage,
};

export class ShaderManager {
  private viewer: Viewer;
  private currentMode: ShaderMode = "normal";
  private currentStage: PostProcessStage | null = null;

  constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  setMode(mode: ShaderMode): void {
    if (mode === this.currentMode) return;
    if (this.viewer.isDestroyed()) return;

    this.clearStage();

    if (mode !== "normal") {
      const factory = STAGE_FACTORIES[mode];
      try {
        const stage = factory(this.viewer);
        this.viewer.scene.postProcessStages.add(stage);
        this.currentStage = stage;
      } catch (err) {
        console.error(`[ShaderManager] Failed to activate ${mode}:`, err);
      }
    }

    this.currentMode = mode;
    this.viewer.scene.requestRender();
  }

  getMode(): ShaderMode {
    return this.currentMode;
  }

  destroy(): void {
    this.clearStage();
  }

  private clearStage(): void {
    if (!this.currentStage) return;

    if (!this.viewer.isDestroyed()) {
      this.viewer.scene.postProcessStages.remove(this.currentStage);
    }
    if (!this.currentStage.isDestroyed()) {
      this.currentStage.destroy();
    }
    this.currentStage = null;
  }
}
