module.exports = {
  apps: [
    {
      name: 'voice-messaging-app',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/voice-messaging-app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/pm2/voice-messaging-app-error.log',
      out_file: '/var/log/pm2/voice-messaging-app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
    },
  ],
};
