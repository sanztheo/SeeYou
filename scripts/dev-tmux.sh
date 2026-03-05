#!/usr/bin/env bash
set -euo pipefail

SESSION_NAME="${1:-seeyou-dev}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
START_DOCKER="${START_DOCKER:-0}"          # 0|1
RUN_CONSUMERS="${RUN_CONSUMERS:-auto}"     # auto|0|1

for arg in "${@:2}"; do
  case "$arg" in
    --docker) START_DOCKER=1 ;;
    --consumers) RUN_CONSUMERS=1 ;;
    --no-consumers) RUN_CONSUMERS=0 ;;
  esac
done

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "❌ tmux n'est pas installé."
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "❌ cargo n'est pas installé."
  exit 1
fi

if [[ "$START_DOCKER" == "1" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "❌ docker n'est pas installé."
    exit 1
  fi

  echo "🚀 Démarrage infra docker (redis/postgres/redpanda/surrealdb)..."
  (
    cd "$ROOT_DIR"
    docker compose up -d redis postgres redpanda surrealdb
  )
else
  echo "ℹ️ Docker local désactivé."
fi

if [[ "$RUN_CONSUMERS" == "auto" ]]; then
  BROKERS="${REDPANDA_BROKERS:-${REDPANDA_URL:-}}"
  BROKERS_PUBLIC="${REDPANDA_BROKERS_PUBLIC:-${REDPANDA_PUBLIC_BROKERS:-}}"

  if [[ -n "$BROKERS" && "$BROKERS" == *".railway.internal"* && -z "$BROKERS_PUBLIC" ]]; then
    RUN_CONSUMERS=0
  else
    RUN_CONSUMERS=1
  fi
fi

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "ℹ️ Session tmux '$SESSION_NAME' déjà active."
  if [[ -n "${TMUX:-}" ]]; then
    tmux switch-client -t "$SESSION_NAME"
  else
    tmux attach -t "$SESSION_NAME"
  fi
  exit 0
fi

tmux new-session -d -s "$SESSION_NAME" -n seeyou -c "$ROOT_DIR"

pane_server="$(tmux display-message -p -t "$SESSION_NAME":0.0 '#{pane_id}')"
pane_top_right="$(tmux split-window -h -t "$pane_server" -c "$ROOT_DIR" -P -F '#{pane_id}')"
pane_bottom_left="$(tmux split-window -v -t "$pane_server" -c "$ROOT_DIR" -P -F '#{pane_id}')"
pane_bottom_right="$(tmux split-window -v -t "$pane_top_right" -c "$ROOT_DIR" -P -F '#{pane_id}')"

cmd_server="cd '$ROOT_DIR' && cargo run -p server --manifest-path backend/Cargo.toml"
cmd_consumer_redis="cd '$ROOT_DIR' && cargo run -p consumer_redis --manifest-path backend/Cargo.toml"
cmd_consumer_postgres="cd '$ROOT_DIR' && cargo run -p consumer_postgres --manifest-path backend/Cargo.toml"
cmd_frontend="cd '$ROOT_DIR/frontend' && if [ ! -d node_modules ]; then npm install; fi && npm run dev"
cmd_health_loop="while true; do date '+%H:%M:%S'; curl -sS -m 3 http://127.0.0.1:3001/health || true; echo; sleep 5; done"
cmd_helper_shell="echo 'Consumers OFF (mode Railway auto).'; echo 'Force: RUN_CONSUMERS=1 ./scripts/dev-tmux.sh'; exec \"${SHELL:-/bin/zsh}\" -i"

tmux send-keys -t "$pane_server" "$cmd_server" C-m

if [[ "$RUN_CONSUMERS" == "1" ]]; then
  echo "ℹ️ Consumers activés."
  tmux send-keys -t "$pane_top_right" "$cmd_consumer_redis" C-m
  tmux send-keys -t "$pane_bottom_left" "$cmd_consumer_postgres" C-m
  tmux send-keys -t "$pane_bottom_right" "$cmd_frontend" C-m
else
  echo "ℹ️ Consumers désactivés (auto)."
  tmux send-keys -t "$pane_top_right" "$cmd_frontend" C-m
  tmux send-keys -t "$pane_bottom_left" "$cmd_health_loop" C-m
  tmux send-keys -t "$pane_bottom_right" "$cmd_helper_shell" C-m
fi

tmux select-layout -t "$SESSION_NAME":0 tiled
tmux select-pane -t "$pane_server"

echo "✅ Session tmux '$SESSION_NAME' prête (4 panes)."

if [[ -n "${TMUX:-}" ]]; then
  tmux switch-client -t "$SESSION_NAME"
else
  tmux attach -t "$SESSION_NAME"
fi
