import { useMemo } from "react";

interface Cluster {
  lat: number;
  lon: number;
  count: number;
  items: string[];
  isCluster: boolean;
}

export function useEntityClustering<T extends { lat: number; lon: number }>(
  entities: Map<string, T>,
  gridSize: number,
  maxUnclustered: number,
): Cluster[] {
  return useMemo(() => {
    if (entities.size <= maxUnclustered) {
      return [...entities.entries()].map(([id, e]) => ({
        lat: e.lat,
        lon: e.lon,
        count: 1,
        items: [id],
        isCluster: false,
      }));
    }

    const grid = new Map<
      string,
      { lats: number[]; lons: number[]; ids: string[] }
    >();

    for (const [id, e] of entities) {
      const cellKey = `${Math.floor(e.lat / gridSize)}_${Math.floor(e.lon / gridSize)}`;
      const cell = grid.get(cellKey) ?? { lats: [], lons: [], ids: [] };
      cell.lats.push(e.lat);
      cell.lons.push(e.lon);
      cell.ids.push(id);
      grid.set(cellKey, cell);
    }

    return [...grid.values()].map((cell) => ({
      lat: cell.lats.reduce((a, b) => a + b, 0) / cell.lats.length,
      lon: cell.lons.reduce((a, b) => a + b, 0) / cell.lons.length,
      count: cell.ids.length,
      items: cell.ids,
      isCluster: cell.ids.length > 1,
    }));
  }, [entities, gridSize, maxUnclustered]);
}
