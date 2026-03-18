// PM2 process config for Asphodel Tower
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'asphodel',
      script: 'dist/index.js',
      cwd: '/home/asphodel/app',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_file: '/home/asphodel/app/.env',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        WS_PORT: 3001,
      },
      error_file: '/home/asphodel/logs/err.log',
      out_file:   '/home/asphodel/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
