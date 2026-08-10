#!/usr/bin/env bash
#
# scripts/camera-heading-audit.sh
#
# Fetches /cameras and reports the distribution of `view_heading_source`
# (provider / parsed / estimated / absent) across all cameras, in absolute
# count and percentage. This is the P2 feasibility number required by P0-0
# (docs/plans/seeyou-v2.md): the FOV-cone test in P2 only applies to the
# provider/parsed fraction — everything else falls back to proximity-only.
#
# `view_heading_source` is an Option<CameraViewSource> with
# skip_serializing_if = "Option::is_none" (backend/crates/cameras/src/types.rs),
# so "absent" means the key is missing from the JSON object entirely, not a
# null value.
#
# Uses python3 for JSON parsing — jq is not guaranteed to be installed.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"

tmp_json="$(mktemp)"
trap 'rm -f "${tmp_json}"' EXIT

curl -sf --max-time 60 "${BASE_URL}/cameras" -o "${tmp_json}"

python3 - "${tmp_json}" <<'PYEOF'
import json
import sys

with open(sys.argv[1]) as f:
    data = json.load(f)

cameras = data["cameras"]
total = len(cameras)

order = ["provider", "parsed", "estimated", "absent"]
counts = dict.fromkeys(order, 0)
for cam in cameras:
    source = cam.get("view_heading_source")
    key = source if source in counts else "absent"
    counts[key] += 1

print(f"total cameras: {total}")
print(f"{'source':<12}{'count':>8}{'pct':>9}")
for key in order:
    n = counts[key]
    pct = (n / total * 100) if total else 0.0
    print(f"{key:<12}{n:>8}{pct:>8.2f}%")

reliable = counts["provider"] + counts["parsed"]
pct_reliable = (reliable / total * 100) if total else 0.0
print(f"\nreliable heading (provider+parsed): {reliable}/{total} = {pct_reliable:.2f}%")
PYEOF
