#!/bin/bash
set -e

########################################
# 基础配置（按需改）
########################################
GITHUB_REPO="JIAJUNATBCIT/QuoteOnline"
PROJECT_DIR="/var/www/QuoteOnline"
BRANCH="main"

########################################
# 交互输入（只需要这一个）
########################################
read -p "请输入你的域名（如 portal.ooishipping.com）: " DOMAIN
if [ -z "$DOMAIN" ]; then
  echo "❌ DOMAIN 不能为空"
  exit 1
fi

########################################
# 安装系统依赖
########################################
echo "🔧 安装系统依赖..."
apt update -y
apt install -y \
  git curl jq docker.io docker-compose \
  certbot python3-certbot-nginx

systemctl enable docker
systemctl start docker

########################################
# 拉取或更新项目
########################################
mkdir -p /var/www
if [ -d "$PROJECT_DIR/.git" ]; then
  echo "📦 更新项目代码..."
  cd "$PROJECT_DIR"
  git pull origin "$BRANCH"
else
  echo "📦 克隆项目代码..."
  git clone -b "$BRANCH" "https://github.com/$GITHUB_REPO.git" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"

########################################
# 生成 HTTP-only Nginx 配置（第一次启动）
########################################
echo "🌐 生成 HTTP Nginx 配置..."

cat > client/nginx.conf <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

########################################
# 启动容器（HTTP）
########################################
echo "🚀 启动 Docker（HTTP）..."
docker compose down || true
docker compose up -d --build

########################################
# 申请 SSL 证书
########################################
echo "🔐 申请 SSL 证书..."
docker compose stop nginx || true

certbot certonly --standalone \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email

########################################
# 生成 HTTPS Nginx 配置
########################################
echo "🔒 切换 HTTPS Nginx 配置..."

cat > client/nginx.conf <<EOF
server {
    listen 443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}

server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
EOF

########################################
# 重启 Nginx
########################################
echo "🔄 重启 Nginx..."
docker compose up -d nginx

########################################
# 设置自动续期
########################################
echo "♻️ 设置 SSL 自动续期..."
(crontab -l 2>/dev/null; echo \
"0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

########################################
# 完成
########################################
echo
echo "✅ 部署完成！"
echo "🌍 https://$DOMAIN"
