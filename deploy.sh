#!/bin/bash
set -e

# ===================== 基础配置 =====================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
PROJECT_DIR="/var/www/QuoteOnline"

read -p "请输入你的域名 (例如 portal.ooishipping.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "\033[31m【错误】域名不能为空！\033[0m"
    exit 1
fi

SERVER_IP=$(curl -s ifconfig.me)

# ===================== 安装系统依赖 =====================
echo "=== 安装系统依赖 ==="
apt update -y

DEPS=("git" "curl" "jq" "openssl" "docker.io" "certbot")
for dep in "${DEPS[@]}"; do
  if ! command -v "$dep" &>/dev/null; then
    apt install -y "$dep"
  fi
done

systemctl enable docker
systemctl start docker

# Docker Compose v2
if ! docker compose version &>/dev/null; then
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# ===================== 拉取项目 =====================
if [ -d "$PROJECT_DIR/.git" ]; then
  echo "=== 更新项目 ==="
  cd "$PROJECT_DIR"
  git pull origin main
else
  echo "=== 克隆项目 ==="
  rm -rf "$PROJECT_DIR"
  git clone https://github.com/$GITHUB_USERNAME/$GITHUB_REPO.git "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

# ===================== 生成 .env（核心） =====================
echo "=== 生成 .env ==="

cat > .env <<EOF
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://$DOMAIN
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

MONGODB_URI=mongodb+srv://dbuser:CHANGE_ME@quoteonline.mongodb.net/quoteonline
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
EMAIL_PASS=CHANGE_ME
MAILGUN_API_KEY=CHANGE_ME
EOF

chmod 600 .env

# ===================== Nginx 配置 =====================
TEMPLATE="client/nginx.conf.template"
NGINX_CONF="client/nginx.conf"

if [ ! -f "$TEMPLATE" ]; then
  echo "找不到 nginx.conf.template"
  exit 1
fi

sed "s/{{DOMAIN}}/$DOMAIN/g" "$TEMPLATE" > "$NGINX_CONF"

# ===================== 启动服务（无 SSL） =====================
docker compose up -d --build
docker compose stop nginx

# ===================== 申请 SSL =====================
echo "=== 申请 SSL ==="

certbot certonly --standalone \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email

# ===================== SSL 自动续期 =====================
(crontab -l 2>/dev/null; \
 echo "0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

# ===================== 启动 Nginx =====================
docker compose start nginx

# ===================== 完成 =====================
echo "======================================"
echo "🎉 部署完成"
echo "🌍 https://$DOMAIN"
echo "📂 项目路径: $PROJECT_DIR"
echo "======================================"
