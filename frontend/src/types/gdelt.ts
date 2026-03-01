export interface GdeltEvent {
  url: string;
  title: string;
  lat: number;
  lon: number;
  tone: number;
  domain: string;
  source_country: string | null;
  image_url: string | null;
}

export interface GdeltResponse {
  events: GdeltEvent[];
  fetched_at: string;
}

export interface GdeltFilter {
  enabled: boolean;
}
