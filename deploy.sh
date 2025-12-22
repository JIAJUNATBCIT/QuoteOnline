#!/bin/bash
# 强制关闭 xtrace 调试模式，消除 + 号输出
set +x
# 保留错误退出，确保脚本异常时终止
set -e

# ===================== 基础配置 =====================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
PROJECT_DIR="/var/www/QuoteOnline"
CLIENT_DIR="$PROJECT_DIR/client"
DIST_DIR="$CLIENT_DIR/dist/quote-online-client"
WORKFLOW_ID="deploy-from-clone.yml"
NGINX_CONF="$PROJECT_DIR/client/nginx.conf"
NGINX_TEMPLATE="$PROJECT_DIR/client/nginx.conf.template"
WEBROOT_PATH="$DIST_DIR"
DOCKER_COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

# ===================== 极简日志函数 =====================
log_info() {
    # 仅输出带颜色的信息，不换行（可选），避免多余空行
    echo -e "\033[32m[INFO] $1\033[0m"
}

log_warn() {
    echo -e "\033[33m[WARN] $1\033[0m"
}

log_error() {
    echo -e "\033[31m[ERROR] $1\033[0m"
    exit 1
}

# ===================== 终极静默函数（覆盖所有场景）=====================
# 支持管道、子命令等所有场景的静默执行
silent() {
    # 重定向标准输出、标准错误，同时关闭 xtrace
    (set +x; "$@") > /dev/null 2>&1
}

# ===================== 用户输入参数 =====================
read -p "请输入你的 GitHub PAT（个人访问令牌）: " GITHUB_PAT
if [ -z "$GITHUB_PAT" ]; then
    log_error "GitHub PAT 不能为空！"
fi

read -p "请输入你的域名（例如 portal.ooishipping.com）: " DOMAIN
if [ -z "$DOMAIN" ]; then
    log_error "域名不能为空！"
fi

DOMAIN_WWW="www.$DOMAIN"

# ===================== 安装系统依赖 =====================
log_info "开始安装系统依赖..."
silent apt update -y
DEPS=("git" "curl" "jq" "openssl" "docker.io" "certbot" "sshpass" "wget" "curl")
for dep in "${DEPS[@]}"; do
    if ! command -v "$dep" &>/dev/null; then
        echo "  安装 $dep..."
        silent apt install -y "$dep"
    fi
done

# 启动 Docker
silent systemctl enable docker
silent systemctl start docker

# 安装 Docker Compose（若未安装）
if ! command -v docker compose &>/dev/null; then
    echo "  安装 Docker Compose..."
    silent mkdir -p /usr/local/lib/docker/cli-plugins
    silent curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
    silent chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# ===================== 安装 Node.js 和 Angular CLI =====================
log_info "开始安装 Node.js 和 Angular CLI..."
# 安装 Node.js LTS 20.x
if ! command -v node &>/dev/null; then
    echo "  安装 Node.js 20.x..."
    # 处理管道命令的静默（将整个管道传入 silent）
    silent bash -c "$(curl -fsSL https://deb.nodesource.com/setup_20.x)"
    silent apt install -y nodejs
fi

# 安装 Angular CLI
if ! command -v ng &>/dev/null; then
    echo "  安装 Angular CLI..."
    silent npm install -g @angular/cli
fi

# 验证安装（简化输出）
echo "  Node.js 版本：$(node -v | awk -F'v' '{print $2}')"
echo "  npm 版本：$(npm -v)"
echo "  Angular CLI 版本：$(ng version --no-progress | grep "Angular CLI" | awk '{print $3}')"

# ===================== 克隆/更新项目仓库 =====================
log_info "开始克隆/更新项目代码..."
silent mkdir -p "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/.git" ]; then
    silent bash -c "cd $PROJECT_DIR && git pull origin main"
else
    silent git clone "https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR"
fi

# 创建日志和上传目录
silent mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"
silent chmod -R 775 "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"
silent chown -R root:node "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"
echo "  已创建 logs/uploads 目录并设置权限"

# 创建空的 .env 文件
silent touch "$PROJECT_DIR/.env"
silent cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"

# ===================== 构建 Angular 项目 =====================
log_info "开始构建 Angular 项目..."
silent cd "$CLIENT_DIR"
silent rm -rf "$DIST_DIR"

if [ -f "$CLIENT_DIR/package.json" ]; then
    echo "  安装 Angular 依赖..."
    silent npm install
else
    log_error "未找到 package.json：$CLIENT_DIR"
fi

# 检测 Angular 版本
ANGULAR_VERSION=$(npm list @angular/core --depth=0 2>/dev/null | grep @angular/core | awk -F'@' '{print $3}' | cut -d'.' -f1)
echo "  检测到 Angular 版本：$ANGULAR_VERSION"

# 构建命令
export NODE_OPTIONS=--max-old-space-size=2048
export CI=true
BUILD_CMD="ng build --configuration production"
if [ -z "$ANGULAR_VERSION" ] || [ "$ANGULAR_VERSION" -lt 12 ]; then
    BUILD_CMD="ng build --prod"
fi

echo "  执行构建：$BUILD_CMD"
silent bash -c "NODE_OPTIONS='--max-old-space-size=2048' $BUILD_CMD"

if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR" 2>/dev/null)" ]; then
    echo "  Angular 构建成功，文件数：$(ls -A "$DIST_DIR" | wc -l)"
else
    log_error "Angular 构建失败！"
fi

# ===================== 生成 generate-env.sh =====================
log_info "生成环境配置脚本..."
silent cat > "$PROJECT_DIR/generate-env.sh" <<'EOF_GENERATE_ENV'
#!/bin/bash
set -e
DOMAIN="$1"
PROJECT_DIR="$2"
cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"
EOF_GENERATE_ENV

silent chmod +x "$PROJECT_DIR/generate-env.sh"
silent "$PROJECT_DIR/generate-env.sh" "$DOMAIN" "$PROJECT_DIR"

# ===================== 触发 GitHub Workflow =====================
log_info "触发 GitHub Actions Workflow..."
JSON_PAYLOAD=$(silent jq -nc \
    --arg ref "main" \
    --arg domain "$DOMAIN" \
    --arg github_pat "$GITHUB_PAT" \
    '{
        ref: $ref,
        inputs: {
            domain: $domain,
            github_pat: $github_pat
        }
    }')

RESPONSE=$(silent curl -s -X POST \
    -H "Authorization: token $GITHUB_PAT" \
    -H "Accept: application/vnd.github.v3+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
    -d "$JSON_PAYLOAD")

if [ -z "$RESPONSE" ] || echo "$RESPONSE" | silent jq -e '.id' &>/dev/null; then
    echo "  Workflow 触发成功，等待同步配置..."
    silent sleep 15
else
    log_warn "Workflow 触发返回信息：$RESPONSE"
fi

# ===================== 环境变量兜底 =====================
log_info "配置环境变量..."
if [ -f "$PROJECT_DIR/.env" ]; then
    silent chmod 600 "$PROJECT_DIR/.env"
    echo "  .env 文件已加载"
else
    echo "  生成默认 .env 配置..."
    silent cat > "$PROJECT_DIR/.env" << EOF
NODE_ENV=production
PORT=3000
DOMAIN=$DOMAIN
FRONTEND_URL=https://$DOMAIN
MONGODB_URI=mongodb://localhost:27017/quoteonline
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
EMAIL_HOST=smtp.$DOMAIN
EMAIL_PORT=587
EMAIL_USER=default@$DOMAIN
EMAIL_PASS=default_pass_123
EMAIL_FROM=default@$DOMAIN
ENABLE_QUOTE_EMAIL_NOTIFICATIONS=true
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_DOMAIN=your_mailgun_domain
UPLOAD_PATH=/app/uploads
MAX_FILE_SIZE=10485760
EOF
    silent chmod 600 "$PROJECT_DIR/.env"
fi

# ===================== Nginx 配置 =====================
log_info "配置 Nginx 服务..."
silent mkdir -p "$PROJECT_DIR/client"

# 生成 HTTP 配置
if [ -d "$NGINX_CONF" ]; then
    silent rm -rf "$NGINX_CONF"
fi

silent cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name $DOMAIN $DOMAIN_WWW;
    root /usr/share/nginx/html;
    index index.html index.htm;
    location /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files \$uri \$uri/ =404;
    }
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# 修正 Docker Compose 配置
if ! grep -q "healthcheck" "$DOCKER_COMPOSE_FILE"; then
    silent sed -i '/services.backend/ a \
    healthcheck:\
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]\
      interval: 30s\
      timeout: 5s\
      retries: 3\
      start_period: 60s\
    deploy:\
      resources:\
        limits:\
          cpus: "1"\
          memory: 512M' "$DOCKER_COMPOSE_FILE"
fi

if ! grep -q "nginx.*healthcheck" "$DOCKER_COMPOSE_FILE"; then
    silent sed -i '/services.nginx/ a \
    healthcheck:\
      test: ["CMD", "nginx", "-t"]\
      interval: 30s\
      timeout: 5s\
      retries: 3' "$DOCKER_COMPOSE_FILE"
fi

# ===================== 启动容器 =====================
log_info "启动容器服务..."
silent cd "$PROJECT_DIR"
silent docker compose down
silent docker compose up -d --build
silent sleep 10

# 检查容器状态
BACKEND_HEALTH=$(docker compose inspect -f '{{.State.Health.Status}}' backend 2>/dev/null || echo "unknown")
NGINX_HEALTH=$(docker compose inspect -f '{{.State.Health.Status}}' nginx 2>/dev/null || echo "unknown")
echo "  Backend 健康状态：$BACKEND_HEALTH"
echo "  Nginx 健康状态：$NGINX_HEALTH"

# ===================== 申请 SSL 证书 =====================
log_info "申请 SSL 证书..."
silent mkdir -p "$WEBROOT_PATH/.well-known/acme-challenge"
silent chmod 755 "$WEBROOT_PATH/.well-known/acme-challenge"

# 执行 certbot
silent certbot certonly \
    --webroot \
    -w "$WEBROOT_PATH" \
    -d "$DOMAIN" \
    -d "$DOMAIN_WWW" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email

# 验证证书
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [ -f "$CERT_PATH" ]; then
    echo "  SSL 证书申请成功"
else
    log_error "SSL 证书申请失败！"
fi

# ===================== 生成 HTTPS 配置 =====================
log_info "配置 HTTPS 服务..."
if [ -f "$NGINX_TEMPLATE" ]; then
    silent sed -e "s/{{DOMAIN}}/$DOMAIN/g" \
        -e "s|include /etc/letsencrypt/options-ssl-nginx.conf;|# 内置SSL配置|g" \
        -e "s|ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;|# DH参数禁用|g" \
        -e "s|proxy_pass http://backend:3000|proxy_pass http://localhost:3000|g" \
        "$NGINX_TEMPLATE" > "$NGINX_CONF"
else
    silent cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name $DOMAIN $DOMAIN_WWW;
    location /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}
server {
    listen 443 ssl http2;
    server_name $DOMAIN $DOMAIN_WWW;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";
    root /usr/share/nginx/html;
    index index.html index.htm;
    location /api/ {
        proxy_pass http://localhost:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    location / {
        try_files \$uri \$uri/ /index.html;
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
        location ~* \.html$ {
            expires -1;
            add_header Cache-Control "no-cache";
        }
    }
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF
fi

# 重启 Nginx
silent docker compose restart nginx

# 配置证书自动续期
silent bash -c "(crontab -l 2>/dev/null; echo '0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx') | crontab -"

# ===================== 验证部署结果 =====================
log_info "验证部署结果..."
echo "  .env 文件：$(if [ -f "$PROJECT_DIR/.env" ]; then echo "存在"; else echo "不存在"; fi)"
echo "  构建文件：$(if [ -d "$DIST_DIR" ]; then echo "存在（$(ls -A "$DIST_DIR" | wc -l)个文件）"; else echo "不存在"; fi)"
echo "  日志目录：$(if [ -d "$PROJECT_DIR/logs" ]; then echo "存在（权限：$(ls -ld "$PROJECT_DIR/logs" | awk '{print $1}')）"; else echo "不存在"; fi)"
echo "  SSL 证书：$(if [ -f "$CERT_PATH" ]; then echo "存在"; else echo "不存在"; fi)"

# ===================== 部署完成 =====================
log_info "部署完成！"
echo "  访问地址：https://$DOMAIN"
echo "  项目路径：$PROJECT_DIR"
echo "  日志路径：$PROJECT_DIR/logs"
echo "  容器管理：docker compose ps/logs/restart"