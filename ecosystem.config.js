module.exports = {
  apps: [
    {
      name: 'wifi-billing',
      script: 'server/server.js',
      instances: 1,         // Single instance — node-routeros connections are not cluster-safe
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      // Restart policy
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      // Structured logs — create ./logs/ first: mkdir -p logs
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
