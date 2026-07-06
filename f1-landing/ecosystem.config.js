// PM2 para la landing F1 (Next.js en producción). Puerto 3005.
module.exports = {
  apps: [
    {
      name: 'f1-landing',
      cwd: '/opt/f1-landing',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3005',
      env: { NODE_ENV: 'production', PORT: '3005' },
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
    },
  ],
}
