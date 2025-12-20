module.exports = {
  apps: [{
    name: 'quoteonline',
    script: 'npm',
    args: 'run prod',
    cwd: '/app',  // 容器内工作目录（对应Dockerfile的WORKDIR）
    interpreter: 'node',
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