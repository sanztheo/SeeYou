export type ShaderMode = "normal" | "nightVision" | "flir" | "crt" | "anime";

export interface ShaderConfig {
  mode: ShaderMode;
  label: string;
  shortcut: string;
  description: string;
}

export const SHADER_CONFIGS: ShaderConfig[] = [
  {
    mode: "normal",
    label: "Normal",
    shortcut: "1",
    description: "Default view",
  },
  {
    mode: "nightVision",
    label: "Night Vision",
    shortcut: "2",
    description: "NVG green tint",
  },
  {
    mode: "flir",
    label: "FLIR Thermal",
    shortcut: "3",
    description: "Thermal imaging",
  },
  {
    mode: "crt",
    label: "CRT Monitor",
    shortcut: "4",
    description: "Retro CRT effect",
  },
  {
    mode: "anime",
    label: "Anime",
    shortcut: "5",
    description: "Cel-shading style",
  },
];
