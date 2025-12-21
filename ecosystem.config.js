module.exports = {
  apps: [{
    name: 'quoteonline',
    script: 'npm',
    args: 'run start:prod', // 【关键】直接启动后端服务，跳过前端构建
    cwd: '/app',
    interpreter: 'none', // 【必须】禁用 Node 解释器，让 PM2 直接执行 npm 命令
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // 日志路径（容器内路径，通过卷挂载到宿主机）
    error_file: '/app/logs/quoteonline-error.log',
    out_file: '/app/logs/quoteonline-out.log',
    log_file: '/app/logs/quoteonline-combined.log',
    time: true,
    merge_logs: true,
    kill_timeout: 5000,
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};