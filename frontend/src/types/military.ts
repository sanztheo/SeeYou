export interface MilitaryBase {
  id?: string;
  name: string;
  country: string;
  branch: string;
  lat: number;
  lon: number;
}

export interface MilitaryFilter {
  enabled: boolean;
  branches: Set<string>;
}

export const ALL_BRANCHES = ["air", "army", "naval", "intelligence"];
