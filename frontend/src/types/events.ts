export type EventCategory =
  | "Wildfires"
  | "SevereStorms"
  | "Volcanoes"
  | "Earthquakes"
  | "Floods"
  | "SeaAndLakeIce"
  | "Other";

export interface NaturalEvent {
  id: string;
  title: string;
  category: EventCategory;
  lat: number;
  lon: number;
  date: string;
  source_url: string | null;
}

export interface EventsResponse {
  events: NaturalEvent[];
  fetched_at: string;
}

export interface EventFilter {
  enabled: boolean;
  categories: Set<EventCategory>;
}

export const ALL_EVENT_CATEGORIES: EventCategory[] = [
  "Wildfires",
  "SevereStorms",
  "Volcanoes",
  "Earthquakes",
  "Floods",
  "SeaAndLakeIce",
];

export const EVENT_CATEGORY_COLORS: Record<EventCategory, string> = {
  Wildfires: "#EF4444",
  SevereStorms: "#8B5CF6",
  Volcanoes: "#F97316",
  Earthquakes: "#EAB308",
  Floods: "#3B82F6",
  SeaAndLakeIce: "#06B6D4",
  Other: "#6B7280",
};

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  Wildfires: "Wildfires",
  SevereStorms: "Storms",
  Volcanoes: "Volcanoes",
  Earthquakes: "Earthquakes",
  Floods: "Floods",
  SeaAndLakeIce: "Ice",
  Other: "Other",
};
