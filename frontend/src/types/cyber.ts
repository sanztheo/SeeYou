export interface CyberThreat {
  id: string;
  threat_type: string;
  malware: string | null;
  src_ip: string;
  src_lat: number;
  src_lon: number;
  src_country: string | null;
  dst_ip: string | null;
  dst_lat: number | null;
  dst_lon: number | null;
  dst_country: string | null;
  confidence: number;
  first_seen: string | null;
}

export interface CyberResponse {
  threats: CyberThreat[];
  fetched_at: string;
}

export interface CyberFilter {
  enabled: boolean;
  minConfidence: number;
}
