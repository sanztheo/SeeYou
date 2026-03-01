import { useMemo } from "react";

interface MinimapProps {
  viewCenter: { lat: number; lon: number } | null;
  viewAltitude: number;
}

const W = 180;
const H = 180;
const PAD = 8;
const MAP_W = W - PAD * 2;
const MAP_H = H - PAD * 2;

function toSvg(lon: number, lat: number): [number, number] {
  const x = PAD + ((lon + 180) / 360) * MAP_W;
  const y = PAD + ((90 - lat) / 180) * MAP_H;
  return [x, y];
}

// Highly simplified continent outlines (equirectangular coords)
const CONTINENTS: [number, number][][] = [
  // North America
  [
    [-130, 55],
    [-120, 60],
    [-100, 60],
    [-85, 70],
    [-65, 50],
    [-80, 25],
    [-105, 20],
    [-120, 35],
    [-130, 55],
  ],
  // South America
  [
    [-80, 10],
    [-60, 5],
    [-35, -5],
    [-40, -22],
    [-55, -35],
    [-70, -55],
    [-75, -20],
    [-80, 10],
  ],
  // Europe
  [
    [-10, 36],
    [0, 43],
    [5, 48],
    [15, 55],
    [30, 60],
    [40, 55],
    [30, 45],
    [25, 36],
    [10, 36],
    [-10, 36],
  ],
  // Africa
  [
    [-15, 15],
    [-5, 35],
    [10, 37],
    [30, 32],
    [40, 15],
    [50, 12],
    [40, -15],
    [30, -35],
    [18, -35],
    [12, -5],
    [-15, 15],
  ],
  // Asia
  [
    [40, 55],
    [60, 55],
    [80, 50],
    [100, 55],
    [120, 55],
    [140, 50],
    [130, 35],
    [120, 25],
    [105, 10],
    [80, 8],
    [65, 25],
    [40, 35],
    [40, 55],
  ],
  // Australia
  [
    [115, -15],
    [130, -12],
    [150, -15],
    [153, -25],
    [148, -38],
    [130, -33],
    [115, -22],
    [115, -15],
  ],
  // Antarctica
  [
    [-180, -70],
    [-120, -75],
    [-60, -70],
    [0, -70],
    [60, -68],
    [120, -67],
    [180, -70],
    [180, -85],
    [-180, -85],
    [-180, -70],
  ],
];

function altitudeToViewExtent(alt: number): { dLon: number; dLat: number } {
  const clampedAlt = Math.max(1000, Math.min(alt, 40_000_000));
  const fovDeg = (clampedAlt / 40_000_000) * 160;
  return { dLon: fovDeg, dLat: fovDeg * 0.6 };
}

export function Minimap({ viewCenter, viewAltitude }: MinimapProps) {
  const coastPaths = useMemo(
    () =>
      CONTINENTS.map((continent) =>
        continent.map(([lon, lat]) => toSvg(lon, lat).join(",")).join(" "),
      ),
    [],
  );

  const center = viewCenter ? toSvg(viewCenter.lon, viewCenter.lat) : null;
  const extent = altitudeToViewExtent(viewAltitude);

  const viewRect = useMemo(() => {
    if (!viewCenter) return null;
    const [cx, cy] = toSvg(viewCenter.lon, viewCenter.lat);
    const hw = (extent.dLon / 360) * MAP_W;
    const hh = (extent.dLat / 180) * MAP_H;
    const rw = Math.max(4, Math.min(hw, MAP_W));
    const rh = Math.max(3, Math.min(hh, MAP_H));
    return {
      x: cx - rw / 2,
      y: cy - rh / 2,
      w: rw,
      h: rh,
    };
  }, [viewCenter, extent.dLon, extent.dLat]);

  const scalePx = 40;
  const scaleKm = useMemo(() => {
    const degreesPerPx = 360 / MAP_W;
    const kmPerDeg = 111;
    const raw = degreesPerPx * scalePx * kmPerDeg;
    const order = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.round(raw / order) * order;
  }, []);

  return (
    <div
      className="fixed bottom-16 right-4 z-40 pointer-events-none select-none"
      style={{ width: W, height: W }}
    >
      <div className="relative w-full h-full bg-gray-900/90 border border-gray-700/50 rounded backdrop-blur-sm overflow-hidden">
        <span className="absolute top-1 left-2 text-[8px] font-mono text-gray-500 tracking-widest">
          MINIMAP
        </span>

        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0"
        >
          {/* grid lines */}
          {[-60, -30, 0, 30, 60].map((lat) => {
            const [, y] = toSvg(0, lat);
            return (
              <line
                key={`lat-${lat}`}
                x1={PAD}
                y1={y}
                x2={W - PAD}
                y2={y}
                stroke="#1f2937"
                strokeWidth={0.5}
              />
            );
          })}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const [x] = toSvg(lon, 0);
            return (
              <line
                key={`lon-${lon}`}
                x1={x}
                y1={PAD}
                x2={x}
                y2={H - PAD}
                stroke="#1f2937"
                strokeWidth={0.5}
              />
            );
          })}

          {/* continents */}
          {coastPaths.map((pts, i) => (
            <polygon
              key={i}
              points={pts}
              fill="#1a2e1a"
              stroke="#22c55e"
              strokeWidth={0.6}
              opacity={0.7}
            />
          ))}

          {/* viewport rectangle */}
          {viewRect && (
            <rect
              x={viewRect.x}
              y={viewRect.y}
              width={viewRect.w}
              height={viewRect.h}
              fill="none"
              stroke="#22c55e"
              strokeWidth={1}
              strokeDasharray="3,2"
              opacity={0.8}
            />
          )}

          {/* center dot */}
          {center && (
            <>
              <circle
                cx={center[0]}
                cy={center[1]}
                r={3}
                fill="#22c55e"
                opacity={0.4}
              />
              <circle cx={center[0]} cy={center[1]} r={1.5} fill="#4ade80" />
            </>
          )}

          {/* scale bar */}
          <line
            x1={PAD}
            y1={H - PAD - 2}
            x2={PAD + scalePx}
            y2={H - PAD - 2}
            stroke="#9ca3af"
            strokeWidth={1}
          />
          <text
            x={PAD + scalePx / 2}
            y={H - PAD - 5}
            textAnchor="middle"
            fill="#9ca3af"
            fontSize={7}
            fontFamily="monospace"
          >
            {scaleKm >= 1000
              ? `${(scaleKm / 1000).toFixed(0)}k km`
              : `${scaleKm} km`}
          </text>
        </svg>
      </div>
    </div>
  );
}
