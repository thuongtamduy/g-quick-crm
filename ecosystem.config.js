// Cấu hình PM2 — chạy:  pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'g-q-crm',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 4444,
      },
      // Gộp log của tất cả instance, kèm timestamp
      merge_logs: true,
      time: true,
      out_file: './logs/g-q-crm-out.log',
      error_file: './logs/g-q-crm-error.log',
    },
  ],
};
