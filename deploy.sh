#!/usr/bin/env bash
set -euo pipefail

# Resolve project root (directory this script lives in)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSH_KEY="$DIR/.ssh/id_ed25519"

APP_SERVER="root@128.140.7.97"
APP_DIR="/home/asphodel/app"

echo "▶ Building..."
npm run build

echo "▶ Syncing to $APP_SERVER..."
rsync -avz \
  -e "ssh -i $SSH_KEY" \
  --exclude node_modules \
  --exclude mnt \
  --exclude .git \
  --exclude .claude \
  --exclude browser-contexts \
  --exclude '*.log' \
  . "$APP_SERVER:$APP_DIR/"

echo "▶ Syncing .env..."
rsync -avz \
  -e "ssh -i $SSH_KEY" \
  "$DIR/.env" "$APP_SERVER:$APP_DIR/.env"

NVM_INIT='export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'

echo "▶ Installing deps + restarting..."
ssh -i "$SSH_KEY" "$APP_SERVER" "
  $NVM_INIT &&
  cd $APP_DIR &&
  npm install --omit=dev &&
  pm2 restart asphodel --update-env
"

echo "✓ Deployed. Tailing logs..."
ssh -i "$SSH_KEY" "$APP_SERVER" "$NVM_INIT && pm2 logs asphodel --lines 20 --nostream"
