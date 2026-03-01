interface OverpassWorkerInput {
  type: "parse";
  rawData: string;
}

interface OverpassWorkerOutput {
  type: "roads";
  roads: Array<{
    id: number;
    road_type: string;
    name: string | null;
    nodes: Array<{ lat: number; lon: number }>;
  }>;
}

self.onmessage = (event: MessageEvent<OverpassWorkerInput>) => {
  const { type, rawData } = event.data;

  if (type === "parse") {
    try {
      const data = JSON.parse(rawData);
      const elements: Array<Record<string, unknown>> = data.elements ?? [];

      const nodeMap = new Map<number, { lat: number; lon: number }>();
      for (const el of elements) {
        if (el.type === "node") {
          nodeMap.set(el.id as number, {
            lat: el.lat as number,
            lon: el.lon as number,
          });
        }
      }

      const roads: OverpassWorkerOutput["roads"] = [];
      for (const el of elements) {
        const tags = el.tags as Record<string, string> | undefined;
        if (el.type !== "way" || !tags?.highway) continue;

        const nodes = ((el.nodes as number[]) ?? [])
          .map((nid) => nodeMap.get(nid))
          .filter((n): n is { lat: number; lon: number } => n != null);

        if (nodes.length < 2) continue;

        roads.push({
          id: el.id as number,
          road_type: tags.highway,
          name: tags.name ?? null,
          nodes,
        });
      }

      (self as unknown as Worker).postMessage({
        type: "roads",
        roads,
      } satisfies OverpassWorkerOutput);
    } catch (err) {
      console.error("Worker parse error:", err);
    }
  }
};

export {};
