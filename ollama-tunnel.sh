#!/usr/bin/env bash
# Opens an SSH tunnel so local port 11434 routes to the Hetzner Ollama server.
# Keep this terminal open while developing.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="$DIR/.ssh/id_ed25519"

OLLAMA_SERVER="root@178.104.95.182"

echo "▶ Tunneling localhost:11434 → Ollama server (178.104.95.182)"
echo "  Keep this open while running npm run dev"
echo "  Ctrl+C to close"
echo ""

ssh -i "$SSH_KEY" \
  -L 11434:localhost:11434 \
  -N \
  -o ServerAliveInterval=60 \
  -o ExitOnForwardFailure=yes \
  "$OLLAMA_SERVER"
