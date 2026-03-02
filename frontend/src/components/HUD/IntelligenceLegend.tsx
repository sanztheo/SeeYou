import type { CablesFilter } from "../../types/cables";
import type { SeismicFilter } from "../../types/seismic";
import type { FiresFilter } from "../../types/fires";
import type { GdeltFilter } from "../../types/gdelt";
import type { MilitaryFilter } from "../../types/military";
import type { NuclearFilter } from "../../types/nuclear";
import type { MaritimeFilter } from "../../types/maritime";
import type { CyberFilter } from "../../types/cyber";
import type { SpaceWeatherFilter } from "../../types/spaceWeather";

interface LegendItem {
  label: string;
  color: string;
  shape: "circle" | "diamond" | "triangle" | "line";
  count?: number;
}

interface Props {
  cablesFilter: CablesFilter;
  cableCount: number;
  seismicFilter: SeismicFilter;
  earthquakeCount: number;
  firesFilter: FiresFilter;
  fireCount: number;
  gdeltFilter: GdeltFilter;
  gdeltCount: number;
  militaryFilter: MilitaryFilter;
  militaryCount: number;
  nuclearFilter: NuclearFilter;
  nuclearCount: number;
  maritimeFilter: MaritimeFilter;
  vesselCount: number;
  cyberFilter: CyberFilter;
  threatCount: number;
  spaceWeatherFilter: SpaceWeatherFilter;
  kpIndex: number;
  sidebarOpen: boolean;
}

function Shape({
  shape,
  color,
}: {
  shape: LegendItem["shape"];
  color: string;
}) {
  if (shape === "line") {
    return (
      <svg width="14" height="10" viewBox="0 0 14 10" className="flex-shrink-0">
        <line
          x1="0"
          y1="5"
          x2="14"
          y2="5"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (shape === "diamond") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0">
        <polygon points="5,0 10,5 5,10 0,5" fill={color} />
      </svg>
    );
  }
  if (shape === "triangle") {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0">
        <polygon points="5,0 10,10 0,10" fill={color} />
      </svg>
    );
  }
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
    />
  );
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function IntelligenceLegend(props: Props): React.ReactElement | null {
  const items: LegendItem[] = [];

  if (props.cablesFilter.enabled)
    items.push({
      label: "Cables",
      color: "#00E5FF",
      shape: "line",
      count: props.cableCount,
    });
  if (props.seismicFilter.enabled)
    items.push({
      label: "Seismes",
      color: "#EAB308",
      shape: "circle",
      count: props.earthquakeCount,
    });
  if (props.firesFilter.enabled)
    items.push({
      label: "Incendies",
      color: "#EF4444",
      shape: "circle",
      count: props.fireCount,
    });
  if (props.gdeltFilter.enabled)
    items.push({
      label: "GDELT",
      color: "#A78BFA",
      shape: "circle",
      count: props.gdeltCount,
    });
  if (props.militaryFilter.enabled)
    items.push({
      label: "Bases mil.",
      color: "#34D399",
      shape: "diamond",
      count: props.militaryCount,
    });
  if (props.nuclearFilter.enabled)
    items.push({
      label: "Nucleaire",
      color: "#FBBF24",
      shape: "circle",
      count: props.nuclearCount,
    });
  if (props.maritimeFilter.enabled)
    items.push({
      label: "Navires",
      color: "#818CF8",
      shape: "triangle",
      count: props.vesselCount,
    });
  if (props.cyberFilter.enabled)
    items.push({
      label: "Cyber",
      color: "#F472B6",
      shape: "circle",
      count: props.threatCount,
    });
  if (props.spaceWeatherFilter.enabled)
    items.push({
      label: `Aurora Kp${props.kpIndex.toFixed(1)}`,
      color: "#22C55E",
      shape: "circle",
    });

  if (items.length === 0) return null;

  const left = props.sidebarOpen ? "left-[290px]" : "left-3";

  return (
    <div className={`fixed bottom-14 ${left} z-20 transition-all`}>
      <div className="flex flex-wrap gap-x-3 gap-y-1 hud-bracket bg-black/80 backdrop-blur-md border border-emerald-900/30 px-3 py-1.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <Shape shape={item.shape} color={item.color} />
            <span className="text-[10px] text-emerald-400/70 font-mono whitespace-nowrap">
              {item.label}
              {item.count != null && (
                <span className="text-emerald-800/50 ml-0.5">
                  [{fmt(item.count)}]
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
