#!/bin/bash
set +x
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

# 部署总阶段数（用于进度标识）
TOTAL_STEPS=10
CURRENT_STEP=0

# ===================== 日志函数（带进度，无重复）=====================
log_step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo -e "\033[32m[${CURRENT_STEP}/${TOTAL_STEPS}] $1\033[0m"
}

log_info() {
    echo -e "  → $1"
}

log_warn() {
    echo -e "\033[33m[WARN] $1\033[0m"
}

log_error() {
    echo -e "\033[31m[ERROR] $1\033[0m"
    exit 1
}

# ===================== 静默函数（增加错误捕获）=====================
silent() {
    (set +x; "$@") > /dev/null 2>&1
}

# 带错误捕获的命令执行函数（用于关键命令）
run_with_error() {
    log_info "$2"
    if (set +x; "$1") > /dev/null 2>&1; then
        log_info "$3"
    else
        log_error "$4"
    fi
}

# ===================== 用户输入参数 =====================
log_step "获取部署参数"
read -p "请输入你的 GitHub PAT（个人访问令牌）: " GITHUB_PAT
if [ -z "$GITHUB_PAT" ]; then
    log_error "GitHub PAT 不能为空！"
fi

read -p "请输入你的域名（例如 portal.ooishipping.com）: " DOMAIN
if [ -z "$DOMAIN" ]; then
    log_error "域名不能为空！"
fi
DOMAIN_WWW="www.$DOMAIN"
log_info "参数获取完成：域名=$DOMAIN"

# ===================== 安装系统依赖 =====================
log_step "安装系统依赖"
silent apt update -y
DEPS=("git" "curl" "jq" "openssl" "docker.io" "certbot" "sshpass" "wget")
for dep in "${DEPS[@]}"; do
    if ! command -v "$dep" &>/dev/null; then
        log_info "安装 $dep..."
        silent apt install -y "$dep"
    fi
done

# 启动 Docker
silent systemctl enable docker
silent systemctl start docker
log_info "Docker 服务已启动"

# 安装 Docker Compose（若未安装）
if ! command -v docker compose &>/dev/null; then
    log_info "安装 Docker Compose..."
    silent mkdir -p /usr/local/lib/docker/cli-plugins
    silent curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
    silent chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi
log_info "系统依赖安装完成"

# ===================== 安装 Node.js 和 Angular CLI =====================
log_step "安装 Node.js 和 Angular CLI"
# 安装 Node.js LTS 20.x（强制升级，避免旧版本残留）
if ! command -v node &>/dev/null || [[ $(node -v | cut -d'v' -f2 | cut -d'.' -f1) -lt 20 ]]; then
    log_info "安装/升级 Node.js 20.x..."
    silent bash -c "$(curl -fsSL https://deb.nodesource.com/setup_20.x)"
    silent apt install -y nodejs --reinstall
    log_info "Node.js 20.x 安装完成（版本：$(node -v | awk -F'v' '{print $2}')）"
else
    log_info "Node.js 已安装（版本：$(node -v | awk -F'v' '{print $2}')）"
fi

# 安装 Angular CLI（解决权限和网络问题）
if ! command -v ng &>/dev/null; then
    log_info "安装 Angular CLI（使用淘宝镜像）..."
    # 切换淘宝镜像，添加权限参数
    if npm install -g @angular/cli --registry=https://registry.npmmirror.com --unsafe-perm; then
        log_info "Angular CLI 安装完成"
    else
        log_error "Angular CLI 安装失败，请检查网络或权限"
    fi
else
    log_info "Angular CLI 已安装（版本：$(ng version --no-progress | grep "Angular CLI" | awk '{print $3}')）"
fi
log_info "Node.js 环境安装完成"

# ===================== 克隆/更新项目仓库 =====================
log_step "克隆/更新项目代码"
silent mkdir -p "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/.git" ]; then
    log_info "更新现有代码..."
    silent bash -c "cd $PROJECT_DIR && git pull origin main"
else
    log_info "克隆新项目代码..."
    silent git clone "https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR"
fi

# 创建日志和上传目录
silent mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"
silent chmod -R 775 "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"
silent chown -R root:node "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"
log_info "已创建 logs/uploads 目录并设置权限"

# 创建空的 .env 文件
silent touch "$PROJECT_DIR/.env"
silent cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"
log_info "项目代码准备完成"

# ===================== 构建 Angular 项目 =====================
log_step "构建 Angular 前端项目"
silent cd "$CLIENT_DIR"
silent rm -rf "$DIST_DIR"

if [ -f "$CLIENT_DIR/package.json" ]; then
    log_info "安装 Angular 依赖..."
    silent npm install
else
    log_error "未找到 package.json：$CLIENT_DIR"
fi

# 检测 Angular 版本
ANGULAR_VERSION=$(npm list @angular/core --depth=0 2>/dev/null | grep @angular/core | awk -F'@' '{print $3}' | cut -d'.' -f1)
log_info "检测到 Angular 版本：$ANGULAR_VERSION"

# 构建命令
export NODE_OPTIONS=--max-old-space-size=2048
export CI=true
BUILD_CMD="ng build --configuration production"
if [ -z "$ANGULAR_VERSION" ] || [ "$ANGULAR_VERSION" -lt 12 ]; then
    BUILD_CMD="ng build --prod"
fi

log_info "执行构建：$BUILD_CMD"
silent bash -c "NODE_OPTIONS='--max-old-space-size=2048' $BUILD_CMD"

if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR" 2>/dev/null)" ]; then
    log_info "Angular 构建成功，文件数：$(ls -A "$DIST_DIR" | wc -l)"
else
    log_error "Angular 构建失败！"
fi

# ===================== 生成环境配置脚本 =====================
log_step "生成环境配置脚本"
silent cat > "$PROJECT_DIR/generate-env.sh" <<'EOF_GENERATE_ENV'
#!/bin/bash
set -e
DOMAIN="$1"
PROJECT_DIR="$2"
cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"
EOF_GENERATE_ENV

silent chmod +x "$PROJECT_DIR/generate-env.sh"
silent "$PROJECT_DIR/generate-env.sh" "$DOMAIN" "$PROJECT_DIR"
log_info "环境配置脚本生成完成"

# ===================== 触发 GitHub Workflow =====================
log_step "触发 GitHub Actions Workflow"
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
    log_info "Workflow 触发成功，等待同步配置..."
    silent sleep 15
else
    log_warn "Workflow 触发返回信息：$RESPONSE"
fi

# ===================== 配置环境变量 =====================
log_step "配置项目环境变量"
if [ -f "$PROJECT_DIR/.env" ]; then
    silent chmod 600 "$PROJECT_DIR/.env"
    log_info ".env 文件已加载"
else
    log_info "生成默认 .env 配置..."
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
    log_info "默认 .env 配置生成完成"
fi

# ===================== 配置 Nginx 并启动容器 =====================
log_step "配置 Nginx 并启动容器"
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

# 修正 Docker Compose 配置（健康检查+资源限制）
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
log_info "Nginx 基础配置完成"

# 启动容器
silent cd "$PROJECT_DIR"
silent docker compose down
silent docker compose up -d --build
silent sleep 10

# 检查容器状态
BACKEND_HEALTH=$(docker compose inspect -f '{{.State.Health.Status}}' backend 2>/dev/null || echo "unknown")
NGINX_HEALTH=$(docker compose inspect -f '{{.State.Health.Status}}' nginx 2>/dev/null || echo "unknown")
log_info "Backend 健康状态：$BACKEND_HEALTH"
log_info "Nginx 健康状态：$NGINX_HEALTH"

# ===================== 申请 SSL 证书并配置 HTTPS =====================
log_step "申请 SSL 证书并配置 HTTPS"
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
    log_info "SSL 证书申请成功"
else
    log_error "SSL 证书申请失败！"
fi

# 生成 HTTPS 配置
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
log_info "HTTPS 配置完成，Nginx 已重启"

# 配置证书自动续期
silent bash -c "(crontab -l 2>/dev/null; echo '0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx') | crontab -"
log_info "SSL 证书自动续期任务已添加"

# ===================== 验证部署结果并完成 =====================
log_step "验证部署结果并完成"
echo -e "  → .env 文件：$(if [ -f "$PROJECT_DIR/.env" ]; then echo "存在"; else echo "不存在"; fi)"
echo -e "  → 构建文件：$(if [ -d "$DIST_DIR" ]; then echo "存在（$(ls -A "$DIST_DIR" | wc -l)个文件）"; else echo "不存在"; fi)"
echo -e "  → 日志目录：$(if [ -d "$PROJECT_DIR/logs" ]; then echo "存在（权限：$(ls -ld "$PROJECT_DIR/logs" | awk '{print $1}')）"; else echo "不存在"; fi)"
echo -e "  → SSL 证书：$(if [ -f "$CERT_PATH" ]; then echo "存在"; else echo "不存在"; fi)"

echo -e "\033[32m✅ 部署完成！\033[0m"
echo -e "  访问地址：https://$DOMAIN"
echo -e "  项目路径：$PROJECT_DIR"
echo -e "  容器管理：docker compose ps/logs/restart"