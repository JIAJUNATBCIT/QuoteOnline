#!/bin/bash
set -e

echo "===== QuoteOnline One-Click Deploy ====="

PROJECT_DIR="/var/www/QuoteOnline"
REPO_URL="https://github.com/JIAJUNATBCIT/QuoteOnline.git"

# ===================== 交互输入（关键：/dev/tty） =====================
read -p "请输入域名 (例如 portal.ooishipping.com): " DOMAIN < /dev/tty
if [ -z "$DOMAIN" ]; then
  echo "❌ DOMAIN 不能为空"
  exit 1
fi

read -s -p "请输入 GitHub PAT（repo 权限即可）: " GITHUB_PAT < /dev/tty
echo
if [ -z "$GITHUB_PAT" ]; then
  echo "❌ GitHub PAT 不能为空"
  exit 1
fi

# ===================== 系统依赖 =====================
echo ">>> 安装系统依赖"
sudo apt update -y
sudo apt install -y git curl jq docker.io docker-compose-plugin certbot

sudo systemctl enable docker
sudo systemctl start docker

# ===================== 释放 80 / 443 端口 =====================
echo ">>> 释放 80 / 443 端口"
sudo systemctl stop nginx || true
sudo systemctl stop apache2 || true
sudo docker ps -q --filter "publish=80" | xargs -r docker stop
sudo docker ps -q --filter "publish=443" | xargs -r docker stop

# ===================== 拉代码 =====================
echo ">>> 拉取代码"
mkdir -p /var/www
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git pull origin main
else
  rm -rf "$PROJECT_DIR"
  git clone https://$GITHUB_PAT@github.com/JIAJUNATBCIT/QuoteOnline.git "$PROJECT_DIR"
fi

cd "$PROJECT_DIR"

# ===================== 生成 .env（稳定版） =====================
echo ">>> 生成 .env"

cat > .env <<EOF
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://$DOMAIN
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# ====== 以下请在服务器后手动替换一次 ======
MONGODB_URI=REPLACE_ME
JWT_SECRET=REPLACE_ME
JWT_REFRESH_SECRET=REPLACE_ME
EMAIL_PASS=REPLACE_ME
MAILGUN_API_KEY=REPLACE_ME

EMAIL_FROM=no-reply@$DOMAIN
EMAIL_HOST=smtp.exmail.qq.com
EMAIL_PORT=465
ENABLE_QUOTE_EMAIL_NOTIFICATIONS=true
MAILGUN_DOMAIN=$DOMAIN
EOF

chmod 600 .env

# ===================== 生成 nginx.conf =====================
echo ">>> 生成 nginx.conf"

sed "s/{{DOMAIN}}/$DOMAIN/g" client/nginx.conf.template > client/nginx.conf

# ===================== 启动容器（HTTP） =====================
echo ">>> 启动 Docker（HTTP）"
docker compose up -d --build

# ===================== 申请 SSL =====================
echo ">>> 申请 SSL 证书"
docker compose stop nginx

sudo certbot certonly \
  --standalone \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --agree-tos \
  --non-interactive \
  --register-unsafely-without-email

# ===================== 重启 nginx =====================
echo ">>> 启动 HTTPS"
docker compose start nginx

# ===================== 自动续期 =====================
echo ">>> 配置证书自动续期"
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

echo
echo "✅ 部署完成"
echo "🌐 https://$DOMAIN"
