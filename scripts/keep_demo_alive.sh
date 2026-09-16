#!/usr/bin/env bash
# Laptop side: SSH tunnel to LaunchPad :5001 + Cloudflare quick tunnel (random *.trycloudflare.com URL).
set -euo pipefail
SSH_HOST="${SSH_HOST:-launchpad-cern}"
PORT="${PORT:-5001}"
API="http://127.0.0.1:${PORT}/api/health"

if ! curl -sf "$API" >/dev/null 2>&1; then
  echo ">> Opening SSH tunnel ${PORT} -> ${SSH_HOST}:${PORT}"
  ssh -f -N -o ExitOnForwardFailure=yes -L "${PORT}:127.0.0.1:${PORT}" "$SSH_HOST"
  for _ in $(seq 1 20); do
    curl -sf "$API" >/dev/null && break
    sleep 1
  done
fi

if ! curl -sf "$API" >/dev/null; then
  echo "Backend not reachable on $API. Start gunicorn on ${SSH_HOST} first." >&2
  exit 1
fi

echo ">> Local API OK. Starting Cloudflare tunnel (URL prints below)."
exec npx --yes cloudflared@latest tunnel --url "http://127.0.0.1:${PORT}"
