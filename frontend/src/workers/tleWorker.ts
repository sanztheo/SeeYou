interface TleWorkerInput {
  type: "propagate";
  satellites: Array<{
    norad_id: number;
    name: string;
    tle_line1: string;
    tle_line2: string;
  }>;
  timestamp: number;
}

interface TleWorkerOutput {
  type: "positions";
  positions: Array<{
    norad_id: number;
    lat: number;
    lon: number;
    altitude_km: number;
  }>;
}

self.onmessage = (event: MessageEvent<TleWorkerInput>) => {
  const { type, satellites, timestamp: _timestamp } = event.data;

  if (type === "propagate") {
    const positions: TleWorkerOutput["positions"] = satellites.map((sat) => ({
      norad_id: sat.norad_id,
      lat: 0,
      lon: 0,
      altitude_km: 0,
    }));

    (self as unknown as Worker).postMessage({
      type: "positions",
      positions,
    } satisfies TleWorkerOutput);
  }
};

export {};
