/**
 * Pure batch accumulator logic — extracted from useAircraftStore
 * for testability. The hook wraps this with React refs and state.
 */

export interface BatchState<K, V> {
  buffer: Map<K, V>;
  receivedChunks: Set<number>;
  expectedChunks: number;
}

export interface BatchResult<K, V> {
  state: BatchState<K, V>;
  flushed: Map<K, V> | null;
}

export function createEmptyBatchState<K, V>(): BatchState<K, V> {
  return {
    buffer: new Map(),
    receivedChunks: new Set(),
    expectedChunks: 0,
  };
}

/**
 * Process one incoming chunk. Returns the updated state and
 * optionally a flushed Map if all chunks have been received.
 */
export function ingestChunk<K, V>(
  state: BatchState<K, V>,
  items: [K, V][],
  chunkIndex: number,
  totalChunks: number,
): BatchResult<K, V> {
  let { buffer, receivedChunks, expectedChunks } = state;

  const isNewCycle =
    totalChunks !== expectedChunks ||
    (chunkIndex === 0 && receivedChunks.size > 0);

  if (isNewCycle) {
    buffer = new Map();
    receivedChunks = new Set();
    expectedChunks = totalChunks;
  }

  for (const [k, v] of items) {
    buffer.set(k, v);
  }
  receivedChunks.add(chunkIndex);

  const complete = receivedChunks.size >= totalChunks;
  if (complete) {
    const flushed = new Map(buffer);
    return {
      state: createEmptyBatchState(),
      flushed,
    };
  }

  return {
    state: { buffer, receivedChunks, expectedChunks },
    flushed: null,
  };
}
