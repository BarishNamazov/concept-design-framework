#!/usr/bin/env sh
set -eu

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOSTNAME="${FRONTEND_HOSTNAME:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

PORT="$BACKEND_PORT" ./deployment/start-backend.sh &
backend_pid="$!"

(
  cd frontend
  HOSTNAME="$FRONTEND_HOSTNAME" PORT="$FRONTEND_PORT" bun run start
) &
frontend_pid="$!"

shutdown() {
  kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
}

terminate() {
  shutdown
  wait "$backend_pid" 2>/dev/null || true
  wait "$frontend_pid" 2>/dev/null || true
  exit 143
}

trap 'terminate' INT TERM

while :; do
  if ! kill -0 "$backend_pid" 2>/dev/null; then
    set +e
    wait "$backend_pid"
    status="$?"
    set -e
    shutdown
    wait "$frontend_pid" 2>/dev/null || true
    exit "$status"
  fi

  if ! kill -0 "$frontend_pid" 2>/dev/null; then
    set +e
    wait "$frontend_pid"
    status="$?"
    set -e
    shutdown
    wait "$backend_pid" 2>/dev/null || true
    exit "$status"
  fi

  sleep 1
done
