import type { CyberThreat } from "../../types/cyber";

interface CyberThreatPopupProps {
  threat: CyberThreat | null;
  onClose: () => void;
}

function confidenceColor(c: number): string {
  if (c >= 80) return "#EF4444";
  if (c >= 50) return "#F97316";
  return "#EAB308";
}

export function CyberThreatPopup({
  threat,
  onClose,
}: CyberThreatPopupProps): React.ReactElement | null {
  if (!threat) return null;

  const confCol = confidenceColor(threat.confidence);

  return (
    <div className="w-72 backdrop-blur-sm border rounded-lg shadow-xl bg-gray-800/95 border-gray-700/50">
      <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 w-2 h-2 rounded-full"
            style={{ backgroundColor: "#F472B6" }}
          />
          <span className="text-sm font-bold text-gray-100 truncate">
            {threat.threat_type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
      <div className="p-3 space-y-2 text-xs">
        {threat.malware && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Malware</span>
            <span className="text-gray-100 font-mono text-right truncate max-w-[160px]">
              {threat.malware}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Confidence</span>
          <span
            className="px-1.5 py-0.5 text-[10px] font-semibold rounded"
            style={{ backgroundColor: confCol + "33", color: confCol }}
          >
            {threat.confidence}%
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-400 shrink-0">Source IP</span>
          <span className="text-gray-100 font-mono">{threat.src_ip}</span>
        </div>
        {threat.src_country && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Source country</span>
            <span className="text-gray-100 font-mono">
              {threat.src_country}
            </span>
          </div>
        )}
        {threat.dst_ip && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Dest IP</span>
            <span className="text-gray-100 font-mono">{threat.dst_ip}</span>
          </div>
        )}
        {threat.dst_country && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">Dest country</span>
            <span className="text-gray-100 font-mono">
              {threat.dst_country}
            </span>
          </div>
        )}
        {threat.first_seen && (
          <div className="flex justify-between gap-2">
            <span className="text-gray-400 shrink-0">First seen</span>
            <span className="text-gray-100 font-mono text-right">
              {new Date(threat.first_seen).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
