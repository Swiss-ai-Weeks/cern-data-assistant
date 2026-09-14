#!/usr/bin/env bash
# Keep qwen2.5:32b + the embed model loaded on the H100 so the first
# judge question is not a cold GPU load.
set -euo pipefail
MODEL="${OLLAMA_MODEL:-qwen2.5:32b}"
EMBED="${OLLAMA_EMBED_MODEL:-nomic-embed-text}"
echo "warming $MODEL + $EMBED ..."
curl -sS -m 180 http://127.0.0.1:11434/api/chat \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"stream\":false,\"keep_alive\":-1}" \
  >/dev/null
curl -sS -m 60 http://127.0.0.1:11434/api/embed \
  -d "{\"model\":\"$EMBED\",\"input\":\"warm\",\"keep_alive\":-1}" \
  >/dev/null || curl -sS -m 60 http://127.0.0.1:11434/api/embeddings \
  -d "{\"model\":\"$EMBED\",\"prompt\":\"warm\"}" \
  >/dev/null
echo "warm."
