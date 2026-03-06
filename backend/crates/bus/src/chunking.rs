use uuid::Uuid;

const CHUNK_MARKER: &str = "#chunk:";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BusChunkInfo {
    pub chunk_id: String,
    pub chunk_index: usize,
    pub total_chunks: usize,
}

impl BusChunkInfo {
    pub fn new(chunk_id: String, chunk_index: usize, total_chunks: usize) -> Self {
        Self {
            chunk_id,
            chunk_index,
            total_chunks,
        }
    }
}

pub fn new_chunk_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn format_chunked_source(base_source: &str, chunk: &BusChunkInfo) -> String {
    format!(
        "{base_source}{CHUNK_MARKER}{}:{}:{}",
        chunk.chunk_id, chunk.chunk_index, chunk.total_chunks
    )
}

pub fn parse_chunked_source(source: &str) -> (&str, Option<BusChunkInfo>) {
    let Some((base_source, suffix)) = source.split_once(CHUNK_MARKER) else {
        return (source, None);
    };

    let mut parts = suffix.split(':');
    let Some(chunk_id) = parts.next() else {
        return (source, None);
    };
    let Some(chunk_index) = parts.next().and_then(|raw| raw.parse::<usize>().ok()) else {
        return (source, None);
    };
    let Some(total_chunks) = parts.next().and_then(|raw| raw.parse::<usize>().ok()) else {
        return (source, None);
    };

    if parts.next().is_some()
        || chunk_id.is_empty()
        || total_chunks == 0
        || chunk_index >= total_chunks
    {
        return (source, None);
    }

    (
        base_source,
        Some(BusChunkInfo::new(
            chunk_id.to_string(),
            chunk_index,
            total_chunks,
        )),
    )
}

#[cfg(test)]
mod tests {
    use super::{format_chunked_source, parse_chunked_source, BusChunkInfo};

    #[test]
    fn chunked_source_round_trips() {
        let chunk = BusChunkInfo::new("group-1".into(), 2, 5);
        let encoded = format_chunked_source("services.aircraft_tracker", &chunk);
        let (base_source, decoded) = parse_chunked_source(&encoded);

        assert_eq!(base_source, "services.aircraft_tracker");
        assert_eq!(decoded, Some(chunk));
    }

    #[test]
    fn parse_chunked_source_rejects_invalid_suffix() {
        let (base_source, decoded) = parse_chunked_source("services.aircraft_tracker#chunk:bad");

        assert_eq!(base_source, "services.aircraft_tracker#chunk:bad");
        assert!(decoded.is_none());
    }
}
