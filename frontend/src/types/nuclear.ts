export interface NuclearSite {
  name: string;
  country: string;
  type: string;
  status: string;
  lat: number;
  lon: number;
  capacity_mw: number;
}

export interface NuclearFilter {
  enabled: boolean;
  types: Set<string>;
}

export const ALL_NUCLEAR_TYPES = [
  "power",
  "weapons",
  "enrichment",
  "reprocessing",
];
