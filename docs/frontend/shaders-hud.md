# Shaders & HUD Overlays

SeeYou features 4 GLSL post-processing shaders and matching HUD (Heads-Up Display) overlays that transform the standard globe view into specialized surveillance modes.

## Shader System

### Architecture

The shader system is managed by `ShaderManager`, a class that handles CesiumJS `PostProcessStage` lifecycle:

```
ShaderManager
├── nightVision.ts    NVG GLSL fragment shader
├── flir.ts           FLIR GLSL fragment shader
├── crt.ts            CRT GLSL fragment shader
├── anime.ts          Anime GLSL fragment shader
└── types.ts          ShaderMode enum + SHADER_CONFIGS array
```

### Shader Modes

| Mode | Key | Visual Effect |
|------|-----|--------------|
| **Night Vision (NVG)** | `1` | Green phosphor tint, bloom, film grain, vignette |
| **FLIR** | `2` | Thermal palette (black-to-white-to-red), targeting reticle overlay |
| **CRT** | `3` | Barrel distortion, horizontal scanlines, chromatic aberration, RGB offset |
| **Anime** | `4` | Sobel edge detection, color posterization, saturation boost |
| **Default** | `5` | No post-processing |

### GLSL Techniques

**Night Vision:**
- Luminance extraction from RGB
- Green channel amplification (`vec3(0.1, 1.0, 0.1)`)
- Additive film grain via pseudo-random noise function
- Radial vignette falloff from screen center
- Bloom approximation via brightness threshold

**FLIR (Thermal):**
- Luminance-to-temperature color mapping
- Multi-stop gradient: black → blue → green → yellow → red → white
- Crosshair/reticle overlay baked into the shader
- Edge enhancement for object detection

**CRT:**
- Barrel distortion via radial UV displacement
- Horizontal scanline pattern (modulated by `gl_FragCoord.y`)
- Chromatic aberration: separate R/G/B channel UV offsets
- Subtle RGB sub-pixel rendering emulation

**Anime:**
- Sobel operator for edge detection (3×3 convolution)
- Color quantization (posterization) to reduce color bands
- Saturation boost via HSL conversion
- Edge overlay in dark color for cel-shaded look

### ShaderManager Class

Manages the complete lifecycle of post-process stages on the Cesium viewer:

1. **`apply(mode)`** — Creates a new `PostProcessStage` with the selected GLSL shader and adds it to the viewer
2. **`remove()`** — Removes the active post-process stage and disposes resources
3. **`toggle(mode)`** — Switches between modes, removing old stage before applying new one
4. Handles viewer lifecycle (cleanup on unmount)

## HUD Overlays

Each shader mode has a matching HUD component that renders a styled overlay on top of the globe:

### NVG HUD (`NvgHud.tsx`)

```
┌─────────────────────────────────────┐
│  ┌──────┐              ┌──────────┐ │
│  │ DMS  │              │ GAIN: 4  │ │
│  │COORDS│              │ IR: ON   │ │
│  └──────┘              └──────────┘ │
│                                     │
│            ╋ (crosshair)            │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  N 48°51'24" E 002°21'03"   │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

- DMS (degrees/minutes/seconds) coordinate display
- Crosshair SVG centered on screen
- GAIN and IR status indicators
- Green-on-dark color scheme

### FLIR HUD (`FlirHud.tsx`)

```
┌─────────────────────────────────────┐
│  TEMP SCALE          RANGE: 12.4km  │
│  ██ HOT                             │
│  ██ WARM             BRG: 045°      │
│  ██ COOL                            │
│  ██ COLD                            │
│                                     │
│           ┌───┐                     │
│           │ ╋ │  (targeting reticle) │
│           └───┘                     │
└─────────────────────────────────────┘
```

- Temperature scale legend (color gradient)
- Range and bearing readout from camera state
- Centered targeting reticle SVG
- Grayscale/thermal color scheme

### CRT HUD (`CrtHud.tsx`)

```
┌─────────────────────────────────────┐
│  ● REC                    CH: 03   │
│                                     │
│                                     │
│                                     │
│                                     │
│                                     │
│  ▌▌▌▌▌▌▌▌  (scanlines)            │
│  2026-03-01 14:32:07 UTC   VHS     │
└─────────────────────────────────────┘
```

- `REC` indicator with blinking dot
- Channel display
- VHS-style timestamp overlay
- Simulated scanline interference

### CursorCoords (`CursorCoords.tsx`)

Bottom-left overlay showing cursor position. Accepts `sidebarOpen` prop to shift right when the sidebar panel is open (`left-[316px]`) or collapsed to rail only (`left-[56px]`).

- **LAT** — Mouse cursor latitude (DDD.DDDD° N/S)
- **LON** — Mouse cursor longitude (DDD.DDDD° E/W)
- **ALT** — Terrain altitude at cursor (auto-formats to meters or km)

### IntelligenceLegend (`IntelligenceLegend.tsx`)

Bottom-left overlay directly above CursorCoords. Shows active intelligence layer indicators with live counts. Only renders when at least one intelligence layer is enabled.

| Layer | Color | Shape | Filter |
|-------|-------|-------|--------|
| Cables | `#00E5FF` (cyan) | line | `cablesFilter` |
| Seismes | `#EAB308` (yellow) | circle | `seismicFilter` |
| Incendies | `#EF4444` (red) | circle | `firesFilter` |
| GDELT | `#A78BFA` (violet) | circle | `gdeltFilter` |
| Bases mil. | `#34D399` (emerald) | diamond | `militaryFilter` |
| Nucleaire | `#FBBF24` (amber) | circle | `nuclearFilter` |
| Navires | `#818CF8` (indigo) | triangle | `maritimeFilter` |
| Cyber | `#F472B6` (pink) | circle | `cyberFilter` |
| Aurora | `#22C55E` (green) | circle | `spaceWeatherFilter` |

The Aurora item includes the current Kp index and is clickable (opens `SpaceWeatherPopup`). Each item shows a count badge in brackets (e.g. `[1.2k]`). Responds to `sidebarOpen` for horizontal positioning.

### CameraInfo (`CameraInfo.tsx`)

Top-right overlay showing:
- **ALT** — Camera altitude
- **HDG** — Camera heading (degrees)
- **PIT** — Camera pitch (degrees)
