import { useMemo } from "react";

interface MinimapProps {
  viewCenter: { lat: number; lon: number } | null;
  viewAltitude: number;
}

const W = 160;
const H = 160;
const PAD = 6;
const MAP_W = W - PAD * 2;
const MAP_H = H - PAD * 2;

function toSvg(lon: number, lat: number): [number, number] {
  return [PAD + ((lon + 180) / 360) * MAP_W, PAD + ((90 - lat) / 180) * MAP_H];
}

const CONTINENTS: [number, number][][] = [
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
];

function altitudeToExtent(alt: number) {
  const clamped = Math.max(1000, Math.min(alt, 40_000_000));
  const fov = (clamped / 40_000_000) * 160;
  return { dLon: fov, dLat: fov * 0.6 };
}

export function Minimap({ viewCenter, viewAltitude }: MinimapProps) {
  const coastPaths = useMemo(
    () =>
      CONTINENTS.map((c) =>
        c.map(([lon, lat]) => toSvg(lon, lat).join(",")).join(" "),
      ),
    [],
  );

  const center = viewCenter ? toSvg(viewCenter.lon, viewCenter.lat) : null;
  const extent = altitudeToExtent(viewAltitude);

  const viewRect = useMemo(() => {
    if (!viewCenter) return null;
    const [cx, cy] = toSvg(viewCenter.lon, viewCenter.lat);
    const hw = (extent.dLon / 360) * MAP_W;
    const hh = (extent.dLat / 180) * MAP_H;
    return {
      x: cx - Math.max(4, Math.min(hw, MAP_W)) / 2,
      y: cy - Math.max(3, Math.min(hh, MAP_H)) / 2,
      w: Math.max(4, Math.min(hw, MAP_W)),
      h: Math.max(3, Math.min(hh, MAP_H)),
    };
  }, [viewCenter, extent.dLon, extent.dLat]);

  return (
    <div
      className="pointer-events-none select-none"
      style={{ width: W, height: H }}
    >
      <div className="relative w-full h-full hud-bracket border border-emerald-900/30 bg-black/80 backdrop-blur-md overflow-hidden">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0"
        >
          {[-60, -30, 0, 30, 60].map((lat) => {
            const [, y] = toSvg(0, lat);
            return (
              <line
                key={`lat${lat}`}
                x1={PAD}
                y1={y}
                x2={W - PAD}
                y2={y}
                stroke="#1c1c1c"
                strokeWidth={0.4}
              />
            );
          })}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const [x] = toSvg(lon, 0);
            return (
              <line
                key={`lon${lon}`}
                x1={x}
                y1={PAD}
                x2={x}
                y2={H - PAD}
                stroke="#1c1c1c"
                strokeWidth={0.4}
              />
            );
          })}
          {coastPaths.map((pts, i) => (
            <polygon
              key={i}
              points={pts}
              fill="#0d1f0d"
              stroke="#22c55e"
              strokeWidth={0.5}
              opacity={0.6}
            />
          ))}
          {viewRect && (
            <rect
              x={viewRect.x}
              y={viewRect.y}
              width={viewRect.w}
              height={viewRect.h}
              fill="none"
              stroke="#22c55e"
              strokeWidth={0.8}
              strokeDasharray="3,2"
              opacity={0.7}
            />
          )}
          {center && (
            <>
              <circle
                cx={center[0]}
                cy={center[1]}
                r={2.5}
                fill="#22c55e"
                opacity={0.3}
              />
              <circle cx={center[0]} cy={center[1]} r={1.2} fill="#4ade80" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
