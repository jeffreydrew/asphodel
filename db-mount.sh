#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="$DIR/.ssh/id_ed25519"
MOUNT="$DIR/mnt"

mkdir -p "$MOUNT"

echo "▶ Mounting app server DB to ./mnt/"
echo "  ⚠  Stop PM2 on the server first: ssh root@128.140.7.97 'pm2 stop asphodel'"
echo "  Set DB_PATH=./mnt/asphodel.db in .env before running npm run dev"
echo "  Ctrl+C to unmount and exit"
echo ""

sshfs -o IdentityFile="$SSH_KEY" \
      -o reconnect \
      -o ServerAliveInterval=60 \
      -o follow_symlinks \
      root@128.140.7.97:/home/asphodel/app \
      "$MOUNT"

echo "✓ Mounted. Press Enter to unmount when done."
read -r

fusermount -u "$MOUNT" 2>/dev/null || umount "$MOUNT"
echo "✓ Unmounted."
