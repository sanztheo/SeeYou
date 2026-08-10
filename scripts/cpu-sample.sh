#!/usr/bin/env bash
#
# scripts/cpu-sample.sh
#
# Samples %CPU of the running backend `server` process every 2s for 60s and
# reports min/mean/max. This is the measurement method for the "CPU serveur
# stable" verification criterion (P0-0 / P0-5, docs/plans/seeyou-v2.md).
#
# Note on the pgrep pattern: anchored with `$` (unlike the bare
# `target/.*/server` quoted in the plan) because an unanchored match can
# also catch a launcher/wrapper shell whose command line happens to contain
# that substring (e.g. a `pkill -f "target/debug/server"` cleanup line runs
# right before starting the real process) — verified empirically in this
# environment, where the unanchored pattern double-matched the launcher
# shell (0% cpu, useless) ahead of the actual server binary.
set -euo pipefail

# Force a plain "." decimal separator: under locales like fr_FR.UTF-8, both
# `ps -o %cpu=` and `awk`'s printf emit "2,4" instead of "2.4", which awk's
# numeric parsing below would silently truncate to "2" (wrong min/mean/max).
export LC_ALL=C

INTERVAL_S="${INTERVAL_S:-2}"
DURATION_S="${DURATION_S:-60}"
SAMPLES=$((DURATION_S / INTERVAL_S))

pid="$(pgrep -f 'target/.*/server$' | head -1)"
if [[ -z "${pid}" ]]; then
  echo "no running process matches 'target/.*/server\$' — is the backend running?" >&2
  exit 1
fi

echo "sampling pid ${pid} ($(ps -o comm= -p "${pid}")) every ${INTERVAL_S}s for ${DURATION_S}s..."

values=()
for ((i = 1; i <= SAMPLES; i++)); do
  cpu="$(ps -o %cpu= -p "${pid}" 2>/dev/null | tr -d ' ')"
  if [[ -z "${cpu}" ]]; then
    echo "process ${pid} exited during sampling" >&2
    break
  fi
  values+=("${cpu}")
  printf '%3d/%d  %%cpu=%s\n' "${i}" "${SAMPLES}" "${cpu}"
  if [[ "${i}" -lt "${SAMPLES}" ]]; then
    sleep "${INTERVAL_S}"
  fi
done

if [[ "${#values[@]}" -eq 0 ]]; then
  echo "no samples collected" >&2
  exit 1
fi

printf '%s\n' "${values[@]}" | awk '
  { if (NR == 1 || $1 < min) min = $1; if (NR == 1 || $1 > max) max = $1; sum += $1; n++ }
  END { printf "\nsamples=%d  min=%.2f%%  mean=%.2f%%  max=%.2f%%\n", n, min, sum / n, max }
'
