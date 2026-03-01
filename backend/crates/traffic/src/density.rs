use crate::types::{RoadType, TrafficDensity};

pub fn estimate_density(road_type: &RoadType, hour: u32) -> TrafficDensity {
    let base_density = base_density_for(road_type);
    let time_multiplier = time_multiplier_for(hour);
    let effective = base_density * time_multiplier;
    let speed_factor = speed_factor_for(road_type, effective);

    TrafficDensity {
        base_density,
        time_multiplier,
        speed_factor,
    }
}

fn base_density_for(road_type: &RoadType) -> f64 {
    match road_type {
        RoadType::Motorway => 40.0,
        RoadType::Trunk => 30.0,
        RoadType::Primary => 20.0,
        RoadType::Secondary => 10.0,
        RoadType::Tertiary => 5.0,
    }
}

fn time_multiplier_for(hour: u32) -> f64 {
    match hour {
        7..=8 => 1.8,
        11..=12 => 1.2,
        17..=18 => 2.0,
        22..=23 | 0..=5 => 0.3,
        _ => 1.0,
    }
}

/// Higher effective density → slower traffic.
/// capacity thresholds are per road type.
fn speed_factor_for(road_type: &RoadType, effective_density: f64) -> f64 {
    let capacity = match road_type {
        RoadType::Motorway => 80.0,
        RoadType::Trunk => 60.0,
        RoadType::Primary => 40.0,
        RoadType::Secondary => 25.0,
        RoadType::Tertiary => 15.0,
    };

    let ratio = effective_density / capacity;
    (1.0 - ratio * 0.8).clamp(0.1, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rush_hour_increases_density() {
        let normal = estimate_density(&RoadType::Motorway, 10);
        let rush = estimate_density(&RoadType::Motorway, 17);
        assert!(rush.time_multiplier > normal.time_multiplier);
    }

    #[test]
    fn night_reduces_density() {
        let night = estimate_density(&RoadType::Primary, 3);
        assert!((night.time_multiplier - 0.3).abs() < f64::EPSILON);
    }

    #[test]
    fn speed_factor_bounds() {
        let d = estimate_density(&RoadType::Tertiary, 17);
        assert!(d.speed_factor >= 0.1);
        assert!(d.speed_factor <= 1.0);
    }
}
