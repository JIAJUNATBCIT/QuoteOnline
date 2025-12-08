# 部署Token过期修复

## 已完成的更改
- ✅ Refresh Token有效期从3天缩短为24小时
- ✅ 已推送到远程仓库

## 服务器端操作步骤

### 1. SSH连接到服务器
```bash
ssh user@portal.ooishipping.com
cd /var/www/QuoteOnline
```

### 2. 拉取最新代码
```bash
git pull origin main
```

### 3. 重启后端服务
```bash
# 如果使用PM2
pm2 restart quoteonline

# 或者如果使用systemd
sudo systemctl restart quoteonline
```

### 4. 验证修复
```bash
# 检查服务状态
pm2 status
# 或
systemctl status quoteonline
```

## 验证方法

### 方法1：手动测试
1. 登录系统
2. 等待30分钟不操作 → 应自动登出（前端已实现）
3. 或等待24小时后 → 需要重新登录

### 方法2：技术验证
```bash
# 登录获取token，检查refresh token过期时间
# 过期时间应该是当前时间+24小时
```

## 预期效果
- ❌ 原来：用户72小时内无需重新登录
- ✅ 现在：用户24小时后需要重新登录
- ✅ 前端30分钟无活动自动登出

## 注意事项
- 无需修改前端配置（已硬编码/api路径）
- 无需修改Nginx配置
- 重启后端服务即可生效