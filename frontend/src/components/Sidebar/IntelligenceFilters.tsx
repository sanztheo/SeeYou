import { useState } from "react";
import type { CablesFilter } from "../../types/cables";
import type { SeismicFilter } from "../../types/seismic";
import type { FiresFilter } from "../../types/fires";
import type { GdeltFilter } from "../../types/gdelt";
import type { MilitaryFilter } from "../../types/military";
import type { NuclearFilter } from "../../types/nuclear";
import type { MaritimeFilter } from "../../types/maritime";
import type { CyberFilter } from "../../types/cyber";
import type { SpaceWeatherFilter } from "../../types/spaceWeather";

interface Props {
  cablesFilter: CablesFilter;
  onCablesFilterChange: (f: CablesFilter) => void;
  seismicFilter: SeismicFilter;
  onSeismicFilterChange: (f: SeismicFilter) => void;
  firesFilter: FiresFilter;
  onFiresFilterChange: (f: FiresFilter) => void;
  gdeltFilter: GdeltFilter;
  onGdeltFilterChange: (f: GdeltFilter) => void;
  militaryFilter: MilitaryFilter;
  onMilitaryFilterChange: (f: MilitaryFilter) => void;
  nuclearFilter: NuclearFilter;
  onNuclearFilterChange: (f: NuclearFilter) => void;
  maritimeFilter: MaritimeFilter;
  onMaritimeFilterChange: (f: MaritimeFilter) => void;
  cyberFilter: CyberFilter;
  onCyberFilterChange: (f: CyberFilter) => void;
  spaceWeatherFilter: SpaceWeatherFilter;
  onSpaceWeatherFilterChange: (f: SpaceWeatherFilter) => void;
  earthquakeCount: number;
  fireCount: number;
  vesselCount: number;
  threatCount: number;
  kpIndex: number;
}

interface ToggleRowProps {
  label: string;
  enabled: boolean;
  onToggle: () => void;
  count?: number;
  color: string;
}

function ToggleRow({ label, enabled, onToggle, count, color }: ToggleRowProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <input
        type="checkbox"
        checked={enabled}
        onChange={onToggle}
        className="sr-only"
      />
      <span
        className={`text-xs transition-colors ${enabled ? "text-zinc-100" : "text-zinc-500 group-hover:text-zinc-400"}`}
      >
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span className="ml-auto text-[10px] text-zinc-500 tabular-nums">
          {count.toLocaleString()}
        </span>
      )}
      <span
        className={`ml-auto w-7 h-4 rounded-full transition-colors flex items-center ${enabled ? "bg-emerald-500/30" : "bg-zinc-700/50"}`}
      >
        <span
          className={`w-3 h-3 rounded-full transition-all ${enabled ? "translate-x-3.5 bg-emerald-400" : "translate-x-0.5 bg-zinc-500"}`}
        />
      </span>
    </label>
  );
}

export function IntelligenceFilters(props: Props): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  const activeCount = [
    props.cablesFilter.enabled,
    props.seismicFilter.enabled,
    props.firesFilter.enabled,
    props.gdeltFilter.enabled,
    props.militaryFilter.enabled,
    props.nuclearFilter.enabled,
    props.maritimeFilter.enabled,
    props.cyberFilter.enabled,
    props.spaceWeatherFilter.enabled,
  ].filter(Boolean).length;

  return (
    <div className="border-t border-zinc-700/40 pt-3 mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <svg
          className={`w-3 h-3 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-medium text-zinc-300 uppercase tracking-wider">
          Intelligence
        </span>
        {activeCount > 0 && (
          <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
            {activeCount} active
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 pl-1">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">
            Terre
          </div>
          <ToggleRow
            label="Cables sous-marins"
            enabled={props.cablesFilter.enabled}
            onToggle={() =>
              props.onCablesFilterChange({
                enabled: !props.cablesFilter.enabled,
              })
            }
            color="#00E5FF"
          />
          <ToggleRow
            label="Seismes"
            enabled={props.seismicFilter.enabled}
            onToggle={() =>
              props.onSeismicFilterChange({
                ...props.seismicFilter,
                enabled: !props.seismicFilter.enabled,
              })
            }
            count={props.earthquakeCount}
            color="#EAB308"
          />
          <ToggleRow
            label="Incendies FIRMS"
            enabled={props.firesFilter.enabled}
            onToggle={() =>
              props.onFiresFilterChange({
                ...props.firesFilter,
                enabled: !props.firesFilter.enabled,
              })
            }
            count={props.fireCount}
            color="#EF4444"
          />

          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 mt-3">
            Geopolitique
          </div>
          <ToggleRow
            label="GDELT News"
            enabled={props.gdeltFilter.enabled}
            onToggle={() =>
              props.onGdeltFilterChange({ enabled: !props.gdeltFilter.enabled })
            }
            color="#A78BFA"
          />
          <ToggleRow
            label="Bases militaires"
            enabled={props.militaryFilter.enabled}
            onToggle={() =>
              props.onMilitaryFilterChange({
                ...props.militaryFilter,
                enabled: !props.militaryFilter.enabled,
              })
            }
            color="#34D399"
          />
          <ToggleRow
            label="Sites nucleaires"
            enabled={props.nuclearFilter.enabled}
            onToggle={() =>
              props.onNuclearFilterChange({
                ...props.nuclearFilter,
                enabled: !props.nuclearFilter.enabled,
              })
            }
            color="#FBBF24"
          />

          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 mt-3">
            Maritime & Cyber
          </div>
          <ToggleRow
            label="Navires sanctionnes"
            enabled={props.maritimeFilter.enabled}
            onToggle={() =>
              props.onMaritimeFilterChange({
                ...props.maritimeFilter,
                enabled: !props.maritimeFilter.enabled,
              })
            }
            count={props.vesselCount}
            color="#818CF8"
          />
          <ToggleRow
            label="Cybermenaces"
            enabled={props.cyberFilter.enabled}
            onToggle={() =>
              props.onCyberFilterChange({
                ...props.cyberFilter,
                enabled: !props.cyberFilter.enabled,
              })
            }
            count={props.threatCount}
            color="#F472B6"
          />

          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1 mt-3">
            Espace
          </div>
          <ToggleRow
            label={`Meteo spatiale${props.kpIndex > 0 ? ` (Kp ${props.kpIndex.toFixed(1)})` : ""}`}
            enabled={props.spaceWeatherFilter.enabled}
            onToggle={() =>
              props.onSpaceWeatherFilterChange({
                enabled: !props.spaceWeatherFilter.enabled,
              })
            }
            color="#22C55E"
          />
        </div>
      )}
    </div>
  );
}
