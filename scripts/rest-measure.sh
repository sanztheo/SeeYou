#!/usr/bin/env bash
#
# scripts/rest-measure.sh
#
# Measures response size/time/status for the REST endpoints listed in
# docs/plans/baseline-mesures.md (section "REST — deux réponses obèses").
# Two passes per endpoint (cold, warm) back to back — cold vs warm matters
# for endpoints that redo per-request work (e.g. /satellites re-inits SGP4
# state per call today; /fires re-decodes the full Redis blob per call).
#
# Usage:
#   ./scripts/rest-measure.sh
#   BASE_URL=http://localhost:3001 ./scripts/rest-measure.sh
set -euo pipefail

# Force a plain "." decimal separator: under locales like fr_FR.UTF-8, awk's
# printf emits "17,044" instead of "17.044" for the MB column.
export LC_ALL=C

BASE_URL="${BASE_URL:-http://localhost:3001}"
ENDPOINTS=(fires cameras satellites seismic events maritime cyber gdelt)

printf '%-12s %-6s %12s %10s %8s %6s\n' "ENDPOINT" "PASS" "BYTES" "MB" "TIME_S" "HTTP"
printf '%-12s %-6s %12s %10s %8s %6s\n' "------------" "------" "------------" "----------" "--------" "------"

for endpoint in "${ENDPOINTS[@]}"; do
  for pass in cold warm; do
    read -r bytes time_s http_code <<< "$(curl -s -o /dev/null --max-time 30 \
      -w '%{size_download} %{time_total} %{http_code}' \
      "${BASE_URL}/${endpoint}")"
    mb="$(awk -v b="${bytes}" 'BEGIN { printf "%.3f", b / 1048576 }')"
    printf '%-12s %-6s %12s %10s %8s %6s\n' "${endpoint}" "${pass}" "${bytes}" "${mb}" "${time_s}" "${http_code}"
  done
done
