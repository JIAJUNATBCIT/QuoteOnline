#!/bin/bash
set -e

# ===================== 从环境变量获取参数 =====================
# 敏感信息（从workflow环境变量传递）
MONGODB_URI="$MONGODB_URI"
JWT_SECRET="$JWT_SECRET"
JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET"
EMAIL_PASS="$EMAIL_PASS"
MAILGUN_API_KEY="$MAILGUN_API_KEY"

# 非敏感信息（从workflow环境变量传递）
EMAIL_FROM="$EMAIL_FROM"
EMAIL_HOST="$EMAIL_HOST"
EMAIL_PORT="$EMAIL_PORT"
ENABLE_QUOTE_EMAIL_NOTIFICATIONS="$ENABLE_QUOTE_EMAIL_NOTIFICATIONS"
MAILGUN_DOMAIN="$MAILGUN_DOMAIN"

# 仓库信息（从workflow环境变量传递）
GITHUB_USERNAME="$GITHUB_USERNAME"
GITHUB_REPO="$GITHUB_REPO"
GITHUB_PAT="$GITHUB_PAT"
PROJECT_DIR="/var/www/QuoteOnline"

# 询问用户输入域名
read -p "请输入你的域名 (例如 portal.ooishipping.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "\033[31m【错误】域名不能为空！\033[0m"
    exit 1
fi

# 校验必要变量是否存在
check_var() {
  local var_name=$1
  local var_value=$2
  if [ -z "$var_value" ]; then
    echo -e "\033[31m【错误】环境变量 $var_name 未设置！\033[0m"
    exit 1
  fi
}

# 校验所有必要变量
check_var "MONGODB_URI" "$MONGODB_URI"
check_var "JWT_SECRET" "$JWT_SECRET"
check_var "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
check_var "EMAIL_PASS" "$EMAIL_PASS"
check_var "MAILGUN_API_KEY" "$MAILGUN_API_KEY"
check_var "EMAIL_FROM" "$EMAIL_FROM"
check_var "EMAIL_HOST" "$EMAIL_HOST"
check_var "EMAIL_PORT" "$EMAIL_PORT"
check_var "GITHUB_PAT" "$GITHUB_PAT"

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

# 安装Docker Compose v2
if ! docker compose version &>/dev/null; then
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# ===================== 拉取/更新项目 =====================
if [ -d "$PROJECT_DIR/.git" ]; then
  echo "=== 更新项目 ==="
  cd "$PROJECT_DIR"
  git pull origin main
else
  echo "=== 克隆项目 ==="
  rm -rf "$PROJECT_DIR"
  # 使用PAT克隆私有仓库
  git clone https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

# ===================== 生成 .env 文件 =====================
echo "=== 生成 .env ==="

cat > .env <<EOF
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://$DOMAIN
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# 敏感信息
MONGODB_URI=$MONGODB_URI
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
EMAIL_PASS=$EMAIL_PASS
MAILGUN_API_KEY=$MAILGUN_API_KEY

# 非敏感信息
EMAIL_FROM=$EMAIL_FROM
EMAIL_HOST=$EMAIL_HOST
EMAIL_PORT=$EMAIL_PORT
ENABLE_QUOTE_EMAIL_NOTIFICATIONS=$ENABLE_QUOTE_EMAIL_NOTIFICATIONS
MAILGUN_DOMAIN=$MAILGUN_DOMAIN
EOF

chmod 600 .env  # 限制.env文件权限
cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"

# ===================== Nginx 配置 =====================
TEMPLATE="client/nginx.conf.template"
NGINX_CONF="client/nginx.conf"

if [ ! -f "$TEMPLATE" ]; then
  echo "找不到 nginx.conf.template"
  exit 1
fi

sed "s/{{DOMAIN}}/$DOMAIN/g" "$TEMPLATE" > "$NGINX_CONF"

# ===================== 启动服务 =====================
echo "=== 启动服务 ==="
docker compose up -d --build
docker compose stop nginx  # 先停止nginx以便申请SSL

# ===================== 申请 SSL 证书 =====================
echo "=== 申请 SSL 证书 ==="
certbot certonly --standalone \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email

# ===================== 配置SSL自动续期 =====================
(crontab -l 2>/dev/null; \
 echo "0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

# ===================== 启动Nginx =====================
docker compose start nginx

# ===================== 部署完成 =====================
echo "======================================"
echo "🎉 部署完成"
echo "🌍 访问地址: https://$DOMAIN"
echo "📂 项目路径: $PROJECT_DIR"
echo "======================================"