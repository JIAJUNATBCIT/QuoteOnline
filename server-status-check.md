# 服务器状态检查和修复

## 问题诊断
- ❌ API服务器返回502 Bad Gateway
- ❌ 后端服务未运行
- ✅ 前端静态文件正常
- ✅ 数据库连接正常

## 立即修复步骤

### 1. SSH连接服务器
```bash
ssh user@portal.ooishipping.com
cd /var/www/QuoteOnline
```

### 2. 检查PM2进程状态
```bash
pm2 status
pm2 logs quoteonline --lines 20
```

### 3. 检查端口占用
```bash
netstat -tlnp | grep :3000
```

### 4. 重启后端服务
```bash
# 如果服务不存在，重新启动
pm2 start server.js --name "quoteonline"

# 如果服务已存在，重启
pm2 restart quoteonline

# 查看启动日志
pm2 logs quoteonline --lines 50
```

### 5. 验证服务启动
```bash
# 检查服务状态
pm2 status

# 检查端口监听
netstat -tlnp | grep :3000

# 测试API健康
curl -I http://localhost:3000/api/auth/verify
```

### 6. 检查Nginx配置
```bash
# 测试Nginx配置
sudo nginx -t

# 重新加载Nginx配置
sudo systemctl reload nginx
```

## 可能的原因

### 1. 邮件修复导致的服务崩溃
- 最近的邮件超时修复可能引入了语法错误
- 检查 server.js 启动日志

### 2. 环境变量问题
- 检查 .env.production 文件是否存在
- 验证 MONGODB_URI 连接字符串

### 3. 依赖包问题
- 可能需要重新安装依赖
- Node.js版本兼容性问题

## 故障排除命令

### 查看详细错误日志
```bash
# PM2日志
pm2 logs quoteonline --lines 100

# 系统日志
journalctl -u quoteonline -f

# Nginx错误日志
sudo tail -f /var/log/nginx/error.log
```

### 手动启动测试
```bash
# 停止PM2进程
pm2 stop quoteonline

# 手动启动查看错误
node server.js

# 如果手动启动成功，再重启PM2
pm2 start server.js --name "quoteonline"
```

### 依赖重新安装
```bash
# 清理并重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 重启服务
pm2 restart quoteonline
```

## 预期结果
修复后应该看到：
- ✅ `pm2 status` 显示 quoteonline 进程运行中
- ✅ `curl http://localhost:3000/api/auth/verify` 返回200
- ✅ 前端可以正常加载询价单列表
- ✅ 创建询价单功能正常工作

## 监控命令
```bash
# 实时监控PM2状态
watch -n 2 pm2 status

# 监控API响应
while true; do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/verify
  echo " - $(date)"
  sleep 5
done
```