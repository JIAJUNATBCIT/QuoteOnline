# 服务器部署指南 - portal.ooishipping.com

## 🚀 快速部署步骤

### 1. 服务器环境准备

```bash
# 连接到服务器
ssh username@your-server-ip

# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装必要工具
sudo npm install -g pm2
sudo apt install -y nginx git
```

### 2. 项目部署

```bash
# 创建项目目录
cd /var/www
sudo mkdir quoteonline
sudo chown $USER:$USER quoteonline
cd quoteonline

# 克隆项目
git clone <您的仓库地址> .

# 测试数据库连接
node test-db-connection.js

# 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

### 3. 域名DNS配置

在您的域名管理面板中设置以下DNS记录：

```
类型: A
主机: portal
值: [您的服务器IP地址]
TTL: 3600 (或默认)

类型: A  (可选)
主机: www.portal
值: [您的服务器IP地址]
TTL: 3600 (或默认)
```

### 4. SSL证书配置

```bash
# 运行SSL配置脚本
chmod +x setup-ssl.sh
./setup-ssl.sh

# 手动配置(如果脚本失败)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d portal.ooishipping.com -d www.portal.ooishipping.com
```

### 5. 验证部署

```bash
# 检查服务状态
pm2 status
sudo systemctl status nginx

# 测试API
curl -X GET http://localhost:3000/api/health

# 测试域名访问
curl -I http://portal.ooishipping.com
curl -I https://portal.ooishipping.com  # SSL配置后
```

## 📋 文件结构

```
/var/www/quoteonline/
├── server.js                    # 后端入口文件
├── package.json                 # 后端依赖
├── client/                      # Angular前端
│   ├── dist/                    # 构建后的静态文件
│   └── package.json             # 前端依赖
├── nginx/                       # Nginx配置
│   └── portal.ooishipping.com.conf
├── .env.production              # 生产环境变量
├── deploy.sh                    # 部署脚本
├── setup-ssl.sh                 # SSL配置脚本
└── test-db-connection.js        # 数据库连接测试
```

## 🔧 配置说明

### Nginx配置特性

- ✅ HTTP和HTTPS支持
- ✅ 自动HTTPS重定向
- ✅ 静态文件缓存优化
- ✅ API代理配置
- ✅ 安全头部设置
- ✅ Gzip压缩
- ✅ 错误页面处理

### PM2进程管理

```bash
# 查看所有进程
pm2 status

# 查看日志
pm2 logs quoteonline-api

# 重启应用
pm2 restart quoteonline-api

# 监控面板
pm2 monit

# 设置开机自启
pm2 startup
pm2 save
```

### SSL证书管理

```bash
# 查看证书状态
sudo certbot certificates

# 手动续期
sudo certbot renew

# 测试续期
sudo certbot renew --dry-run

# 查看续期日志
sudo cat /var/log/letsencrypt/letsencrypt.log
```

## 🔍 故障排除

### 1. 域名无法访问

```bash
# 检查DNS解析
nslookup portal.ooishipping.com

# 检查Nginx状态
sudo systemctl status nginx

# 检查Nginx配置
sudo nginx -t

# 查看Nginx错误日志
sudo tail -f /var/log/nginx/portal.ooishipping.com.error.log
```

### 2. API无法访问

```bash
# 检查后端进程
pm2 status

# 查看后端日志
pm2 logs quoteonline-api

# 测试本地API
curl http://localhost:3000/api/health

# 检查端口占用
sudo netstat -tlnp | grep :3000
```

### 3. 数据库连接问题

```bash
# 测试数据库连接
node test-db-connection.js

# 检查环境变量
cat .env

# 查看应用日志中的数据库错误
pm2 logs quoteonline-api | grep -i mongodb
```

### 4. SSL证书问题

```bash
# 检查证书有效期
sudo openssl x509 -in /etc/letsencrypt/live/portal.ooishipping.com/cert.pem -text -noout | grep "Not After"

# 重新获取证书
sudo certbot delete --cert-name portal.ooishipping.com
sudo certbot --nginx -d portal.ooishipping.com -d www.portal.ooishipping.com
```

## 🔒 安全建议

1. **防火墙配置**
```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

2. **定期更新**
```bash
# 设置自动安全更新
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

3. **监控设置**
```bash
# 设置日志轮转
sudo nano /etc/logrotate.d/quoteonline
```

## 📞 联系信息

如有问题，请检查：
- 服务器日志: `pm2 logs quoteonline-api`
- Nginx日志: `/var/log/nginx/portal.ooishipping.com.*.log`
- 数据库连接: `node test-db-connection.js`

---

**部署完成后，您的应用将可通过以下地址访问：**
- 🌐 http://portal.ooishipping.com
- 🔒 https://portal.ooishipping.com (SSL配置后)