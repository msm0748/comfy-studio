// PM2 loads ecosystem files as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('node:path');
module.exports = {
  apps: [{
    name: 'comfy-studio',
    cwd: __dirname,
    script: path.join(__dirname, 'node_modules/next/dist/bin/next'),
    args: 'start --hostname 127.0.0.1 --port 3002',
    interpreter: process.execPath,
    env: { NODE_ENV: 'production' },
    autorestart: true,
    restart_delay: 5000,
    max_memory_restart: '1G',
    out_file: path.join(__dirname, '.data/studio.stdout.log'),
    error_file: path.join(__dirname, '.data/studio.stderr.log'),
  }],
};
