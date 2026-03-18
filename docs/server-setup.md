# Asphodel Tower — Server Setup

Two Hetzner servers:

| Role | Type | Purpose |
|------|------|---------|
| **App** | CX32 (4 vCPU, 8 GB) | Node app + Nginx + Ghost |
| **Ollama** | CPX41 (8 vCPU, 16 GB, no GPU) | Ollama LLM (qwen2.5:7b) |

---

## 1. App Server (CX32)

### Base setup
```bash
apt update && apt upgrade -y
apt install -y nginx certbot python3-certbot-nginx ufw git curl

# Node 22 via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22 && nvm alias default 22

# PM2
npm install -g pm2

# Create app user
useradd -m -s /bin/bash asphodel
mkdir -p /home/asphodel/{app,logs}
```

### Deploy the app
```bash
# As asphodel user
cd /home/asphodel/app
git clone <your-repo> .
npm install
npm run build
cp .env.production .env

# Start with PM2
pm2 start /home/asphodel/app/ecosystem.config.js
pm2 save
pm2 startup   # follow the printed command to register with systemd
```

### Nginx config
`/etc/nginx/sites-available/asphodel`:
```nginx
server {
    listen 80;
    server_name asphodel.world www.asphodel.world;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name asphodel.world www.asphodel.world;

    ssl_certificate     /etc/letsencrypt/live/asphodel.world/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/asphodel.world/privkey.pem;

    # Three.js frontend + REST API (port 3000)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket (port 3001)
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/asphodel /etc/nginx/sites-enabled/
certbot --nginx -d asphodel.world -d www.asphodel.world
nginx -t && systemctl reload nginx
```

### Firewall
```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

---

## 2. Ollama Server (CPX41)

```bash
apt update && apt upgrade -y
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model
ollama pull qwen2.5:7b

# Bind to all interfaces so the app server can reach it
# Edit /etc/systemd/system/ollama.service
# Add under [Service]: Environment="OLLAMA_HOST=0.0.0.0:11434"
systemctl daemon-reload && systemctl restart ollama

# Allow app server IP only
ufw allow from <APP_SERVER_IP> to any port 11434
ufw enable
```

In your app `.env`:
```
OLLAMA_URL=http://<OLLAMA_SERVER_IP>:11434
OLLAMA_MODEL=qwen2.5:7b
```

---

## 3. Ghost (self-hosted on App Server)

```bash
# Ghost requires its own user and MySQL
apt install -y mysql-server
mysql -u root -e "CREATE USER 'ghost'@'localhost' IDENTIFIED BY 'strongpassword'; CREATE DATABASE ghost; GRANT ALL ON ghost.* TO 'ghost'@'localhost';"

npm install -g ghost-cli
useradd -m -s /bin/bash ghost-user
su - ghost-user
mkdir /var/www/ghost && cd /var/www/ghost
ghost install --db mysql --dbhost localhost --dbuser ghost --dbpass strongpassword --dbname ghost \
  --url https://blog.asphodel.world --port 2368 --no-prompt
```

Add a Ghost Nginx block:
```nginx
server {
    listen 443 ssl;
    server_name blog.asphodel.world;
    # ssl certs ...
    location / {
        proxy_pass http://127.0.0.1:2368;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Get your Admin API key from Ghost Admin → Integrations → Add custom integration.
Set in `.env`:
```
GHOST_URL=https://blog.asphodel.world
GHOST_ADMIN_KEY=<key_id>:<key_secret>
```

---

## 4. Social / Stripe credentials

| Service | Where to get |
|---------|-------------|
| Twitter | developer.twitter.com — create project → OAuth 1.0a app, get all 4 keys |
| Reddit | reddit.com/prefs/apps — "script" app type; each soul needs its own account |
| Stripe | dashboard.stripe.com — enable Connect, get `sk_live_...` key |

Set per-soul Twitter keys as `TWITTER_{SOUL_FIRST_NAME}_API_KEY` etc., or use the shared `TWITTER_*` fallback.

---

## 5. .env.production checklist

```bash
PORT=3000
WS_PORT=3001
DB_PATH=/home/asphodel/app/asphodel.db
LOG_LEVEL=info

OLLAMA_URL=http://<OLLAMA_IP>:11434
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_TIMEOUT_MS=30000

ENABLE_BROWSER=false          # true only if you install Playwright on app server
ENABLE_REAL_MONEY=false       # true + STRIPE_SECRET_KEY to enable Stripe Connect

GHOST_URL=https://blog.asphodel.world
GHOST_ADMIN_KEY=<id>:<secret>

TWITTER_API_KEY=...
# ... etc
```

---

## 6. 3D Model files

Download CC0 model packs and place in `public/models/`:

1. **Quaternius** — quaternius.com → "Ultimate Modular Characters" → export as `.glb`
   → `public/models/characters/sim_base.glb`

2. **Kenney** — kenney.nl → "Furniture Kit" → extract individual pieces:
   → `public/models/furniture/{desk,chair,sofa_red,sofa_blue,bed,monitor,bookshelf,plant_tall,lamp_floor,treadmill,kitchen_counter,fridge}.glb`

The Three.js frontend will silently fall back to the built-in capsule/box geometry if any model file is missing.
