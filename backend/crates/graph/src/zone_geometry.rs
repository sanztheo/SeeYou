use anyhow::anyhow;
use geojson::Geometry;

const EARTH_RADIUS_M: f64 = 6_371_000.0;

type Ring = Vec<LonLat>;

#[derive(Debug, Clone, Copy)]
struct LonLat {
    lon: f64,
    lat: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct PolygonRings {
    rings: Vec<Ring>,
}

#[derive(Debug, Clone)]
pub(crate) struct ZoneIndex {
    pub(crate) zone_id: String,
    pub(crate) zone_type: Option<String>,
    polygons: Vec<PolygonRings>,
    bbox: BBox,
}

#[derive(Debug, Clone, Copy)]
struct BBox {
    min_lon: f64,
    max_lon: f64,
    min_lat: f64,
    max_lat: f64,
}

impl BBox {
    fn empty() -> Self {
        Self {
            min_lon: f64::INFINITY,
            max_lon: f64::NEG_INFINITY,
            min_lat: f64::INFINITY,
            max_lat: f64::NEG_INFINITY,
        }
    }

    fn expand(&mut self, lon: f64, lat: f64) {
        self.min_lon = self.min_lon.min(lon);
        self.max_lon = self.max_lon.max(lon);
        self.min_lat = self.min_lat.min(lat);
        self.max_lat = self.max_lat.max(lat);
    }

    fn contains(&self, lon: f64, lat: f64) -> bool {
        lon >= self.min_lon && lon <= self.max_lon && lat >= self.min_lat && lat <= self.max_lat
    }

    fn is_valid(&self) -> bool {
        self.min_lon.is_finite()
            && self.max_lon.is_finite()
            && self.min_lat.is_finite()
            && self.max_lat.is_finite()
            && self.min_lon <= self.max_lon
            && self.min_lat <= self.max_lat
    }

    fn distance_to_point_m(&self, lon: f64, lat: f64) -> f64 {
        let nearest_lon = lon.clamp(self.min_lon, self.max_lon);
        let nearest_lat = lat.clamp(self.min_lat, self.max_lat);

        if nearest_lon == lon && nearest_lat == lat {
            return 0.0;
        }

        haversine_m(lat, lon, nearest_lat, nearest_lon)
    }
}

impl ZoneIndex {
    pub(crate) fn new(
        zone_id: String,
        zone_type: Option<String>,
        polygons: Vec<PolygonRings>,
    ) -> Option<Self> {
        if polygons.is_empty() {
            return None;
        }

        let mut bbox = BBox::empty();
        for polygon in &polygons {
            for ring in &polygon.rings {
                for point in ring {
                    bbox.expand(point.lon, point.lat);
                }
            }
        }

        if !bbox.is_valid() {
            return None;
        }

        Some(Self {
            zone_id,
            zone_type,
            polygons,
            bbox,
        })
    }

    pub(crate) fn contains(&self, lat: f64, lon: f64) -> bool {
        if !self.bbox.contains(lon, lat) {
            return false;
        }

        self.polygons
            .iter()
            .any(|polygon| point_in_polygon(lon, lat, &polygon.rings))
    }

    pub(crate) fn distance_m(&self, lat: f64, lon: f64) -> f64 {
        self.polygons
            .iter()
            .flat_map(|polygon| polygon.rings.iter())
            .filter_map(|ring| distance_to_ring_m(lon, lat, ring))
            .fold(f64::INFINITY, f64::min)
    }

    pub(crate) fn bbox_distance_m(&self, lat: f64, lon: f64) -> f64 {
        self.bbox.distance_to_point_m(lon, lat)
    }
}

pub(crate) fn polygons_from_geometry(geometry: &Geometry) -> anyhow::Result<Vec<PolygonRings>> {
    let mut polygons = Vec::new();
    match &geometry.value {
        geojson::Value::Polygon(raw_polygon) => {
            let rings = parse_polygon_rings(raw_polygon)?;
            if !rings.is_empty() {
                polygons.push(PolygonRings { rings });
            }
        }
        geojson::Value::MultiPolygon(raw_multi) => {
            for raw_polygon in raw_multi {
                let rings = parse_polygon_rings(raw_polygon)?;
                if !rings.is_empty() {
                    polygons.push(PolygonRings { rings });
                }
            }
        }
        _ => {}
    }
    Ok(polygons)
}

fn parse_polygon_rings(raw_polygon: &[Vec<Vec<f64>>]) -> anyhow::Result<Vec<Ring>> {
    let mut rings = Vec::new();
    for raw_ring in raw_polygon {
        let mut ring = Vec::new();
        for coord in raw_ring {
            let lon = *coord.first().ok_or_else(|| anyhow!("missing longitude"))?;
            let lat = *coord.get(1).ok_or_else(|| anyhow!("missing latitude"))?;
            ring.push(LonLat { lon, lat });
        }
        if ring.len() >= 3 {
            rings.push(ring);
        }
    }
    Ok(rings)
}

fn point_in_polygon(lon: f64, lat: f64, rings: &[Ring]) -> bool {
    let Some((outer, holes)) = rings.split_first() else {
        return false;
    };
    if !point_in_ring(lon, lat, outer) {
        return false;
    }
    !holes.iter().any(|ring| point_in_ring(lon, lat, ring))
}

fn point_in_ring(lon: f64, lat: f64, ring: &Ring) -> bool {
    let mut inside = false;
    let mut j = ring.len() - 1;
    for i in 0..ring.len() {
        let xi = ring[i].lon;
        let yi = ring[i].lat;
        let xj = ring[j].lon;
        let yj = ring[j].lat;

        let y_delta = yj - yi;
        if y_delta.abs() <= f64::EPSILON {
            j = i;
            continue;
        }

        let intersects =
            ((yi > lat) != (yj > lat)) && (lon < (xj - xi) * (lat - yi) / y_delta + xi);
        if intersects {
            inside = !inside;
        }
        j = i;
    }
    inside
}

fn distance_to_ring_m(lon: f64, lat: f64, ring: &Ring) -> Option<f64> {
    if ring.len() < 2 {
        return None;
    }

    let mut min_distance = f64::INFINITY;
    for i in 0..ring.len() {
        let a = ring[i];
        let b = ring[(i + 1) % ring.len()];
        min_distance = min_distance.min(distance_point_to_segment_m(lon, lat, a, b));
    }
    Some(min_distance)
}

fn distance_point_to_segment_m(lon: f64, lat: f64, a: LonLat, b: LonLat) -> f64 {
    let origin_lat = lat.to_radians();
    let to_xy = |p: LonLat| -> (f64, f64) {
        let x = EARTH_RADIUS_M * p.lon.to_radians() * origin_lat.cos();
        let y = EARTH_RADIUS_M * p.lat.to_radians();
        (x, y)
    };

    let p = to_xy(LonLat { lon, lat });
    let a = to_xy(a);
    let b = to_xy(b);

    let ab = (b.0 - a.0, b.1 - a.1);
    let ap = (p.0 - a.0, p.1 - a.1);
    let ab_len_sq = ab.0 * ab.0 + ab.1 * ab.1;

    let t = if ab_len_sq <= f64::EPSILON {
        0.0
    } else {
        ((ap.0 * ab.0 + ap.1 * ab.1) / ab_len_sq).clamp(0.0, 1.0)
    };
    let closest = (a.0 + t * ab.0, a.1 + t * ab.1);
    ((p.0 - closest.0).powi(2) + (p.1 - closest.1).powi(2)).sqrt()
}

fn haversine_m(lat_a: f64, lon_a: f64, lat_b: f64, lon_b: f64) -> f64 {
    let dlat = (lat_b - lat_a).to_radians();
    let dlon = (lon_b - lon_a).to_radians();
    let lat_a_rad = lat_a.to_radians();
    let lat_b_rad = lat_b.to_radians();

    let a =
        (dlat / 2.0).sin().powi(2) + lat_a_rad.cos() * lat_b_rad.cos() * (dlon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().asin();

    EARTH_RADIUS_M * c
}

#[cfg(test)]
mod tests {
    use super::{point_in_polygon, polygons_from_geometry, ZoneIndex};
    use geojson::Geometry;

    #[test]
    fn polygons_from_geometry_accepts_3d_coordinates() {
        let geometry = Geometry::new(geojson::Value::Polygon(vec![vec![
            vec![0.0, 0.0, 0.0],
            vec![1.0, 0.0, 12.0],
            vec![1.0, 1.0, 22.0],
            vec![0.0, 1.0, 7.0],
            vec![0.0, 0.0, 0.0],
        ]]));

        let polygons = polygons_from_geometry(&geometry).expect("polygon parsing");
        assert_eq!(polygons.len(), 1);
    }

    #[test]
    fn point_in_polygon_handles_clockwise_ring() {
        let ring = vec![
            super::LonLat { lon: 0.0, lat: 0.0 },
            super::LonLat { lon: 0.0, lat: 2.0 },
            super::LonLat { lon: 2.0, lat: 2.0 },
            super::LonLat { lon: 2.0, lat: 0.0 },
            super::LonLat { lon: 0.0, lat: 0.0 },
        ];

        assert!(point_in_polygon(1.0, 1.0, &[ring.clone()]));
        assert!(!point_in_polygon(3.0, 3.0, &[ring]));
    }

    #[test]
    fn bbox_distance_is_zero_inside_and_positive_outside() {
        let geometry = Geometry::new(geojson::Value::Polygon(vec![vec![
            vec![0.0, 0.0],
            vec![2.0, 0.0],
            vec![2.0, 2.0],
            vec![0.0, 2.0],
            vec![0.0, 0.0],
        ]]));
        let polygons = polygons_from_geometry(&geometry).expect("polygon parsing");
        let zone = ZoneIndex::new("zone".to_string(), None, polygons).expect("zone index");

        assert_eq!(zone.bbox_distance_m(1.0, 1.0), 0.0);
        assert!(zone.bbox_distance_m(3.0, 3.0) > 0.0);
    }
}
