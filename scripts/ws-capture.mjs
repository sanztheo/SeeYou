#!/usr/bin/env node
//
// scripts/ws-capture.mjs
//
// Connects to the SeeYou WebSocket endpoint and measures wire volume per
// message `type` over a fixed observation window. Reproduces the numbers in
// docs/plans/baseline-mesures.md (section "WebSocket — 31,67 MB/minute").
//
// Zero dependencies: Node 22+ exposes `WebSocket` globally (undici-backed),
// so this avoids adding the `ws` package to the repo (it isn't present in
// frontend/node_modules either).
//
// Usage:
//   node scripts/ws-capture.mjs [duration_ms] [ws_url]
//   node scripts/ws-capture.mjs 45000 ws://localhost:3001/ws

const DURATION_MS = Number(process.argv[2] ?? 45_000);
const WS_URL = process.argv[3] ?? 'ws://localhost:3001/ws';

const KB = 1024;
const MB = 1024 * 1024;

/** @type {Map<string, { count: number, bytes: number, firstMs: number }>} */
const stats = new Map();

function recordMessage(type, bytes, elapsedMs) {
  const entry = stats.get(type);
  if (entry) {
    entry.count += 1;
    entry.bytes += bytes;
  } else {
    stats.set(type, { count: 1, bytes, firstMs: elapsedMs });
  }
}

function fmt(n, decimals) {
  return n.toFixed(decimals);
}

function printReport(elapsedMs) {
  const minutes = elapsedMs / 60_000;
  const rows = [...stats.entries()]
    .map(([type, s]) => ({ type, ...s }))
    .sort((a, b) => b.bytes - a.bytes);

  const totalBytes = rows.reduce((sum, r) => sum + r.bytes, 0);
  const totalCount = rows.reduce((sum, r) => sum + r.count, 0);

  const headers = ['TYPE', 'FIRST_MSG_MS', 'MESSAGES', 'TOTAL_MB', 'KB_PER_MSG', 'MB_PER_MIN'];
  const body = rows.map((r) => [
    r.type,
    String(r.firstMs),
    String(r.count),
    fmt(r.bytes / MB, 2),
    fmt(r.bytes / r.count / KB, 1),
    fmt((r.bytes / MB) / minutes, 2),
  ]);
  const totalRow = [
    'TOTAL',
    '-',
    String(totalCount),
    fmt(totalBytes / MB, 2),
    fmt(totalBytes / totalCount / KB, 1),
    fmt((totalBytes / MB) / minutes, 2),
  ];

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...body.map((row) => row[i].length), totalRow[i].length),
  );
  const line = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ');

  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of body) console.log(line(row));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  console.log(line(totalRow));

  console.log(
    `\nobserved ${fmt(elapsedMs / 1000, 1)}s, ${totalCount} messages, ` +
      `${fmt(totalBytes / MB, 2)} MB total -> ${fmt((totalBytes / MB) / minutes, 2)} MB/min`,
  );
}

async function main() {
  console.log(`connecting to ${WS_URL}, capturing for ${DURATION_MS}ms...`);
  const start = performance.now();
  const socket = new WebSocket(WS_URL);

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', () => {
      console.log('connected, listening for broadcasts...');
    });

    socket.addEventListener('message', (event) => {
      // The server only ever sends Message::Text frames (ws/handler.rs
      // encode_message), so event.data is always a JSON string here.
      const elapsedMs = Math.round(performance.now() - start);
      const bytes = Buffer.byteLength(event.data, 'utf8');
      let type = 'unparseable';
      try {
        type = JSON.parse(event.data)?.type ?? 'unknown';
      } catch {
        // keep 'unparseable' — not expected from this server, kept visible
        // rather than silently dropped.
      }
      recordMessage(type, bytes, elapsedMs);
    });

    socket.addEventListener('error', () => {
      reject(new Error(`websocket error connecting to ${WS_URL} — is the server running?`));
    });

    setTimeout(resolve, DURATION_MS);
  });

  const elapsedMs = performance.now() - start;
  socket.close();

  if (stats.size === 0) {
    console.error('no messages captured in the observation window — nothing to report.');
    process.exitCode = 1;
    return;
  }

  printReport(elapsedMs);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
