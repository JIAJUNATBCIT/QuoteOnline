#!/bin/bash
set -e

# ===================== 基础配置 =====================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
PROJECT_DIR="/var/www/QuoteOnline"
CLIENT_DIR="$PROJECT_DIR/client"  # Angular 客户端目录
DIST_DIR="$CLIENT_DIR/dist/quote-online-client"  # 构建输出目录
WORKFLOW_ID="deploy-from-clone.yml"
# 核心修改：统一使用 nginx.conf 作为配置文件名，不再区分 http/https
NGINX_CONF="$PROJECT_DIR/client/nginx.conf"          # Nginx 主配置文件
NGINX_TEMPLATE="$PROJECT_DIR/client/nginx.conf.template"  # 原有模板
WEBROOT_PATH="$DIST_DIR"                                   # certbot webroot路径
DOCKER_COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"      # Docker Compose文件路径

# ===================== 颜色输出函数 =====================
log_info() {
    echo -e "\033[32m[INFO] $1\033[0m"
}

log_warn() {
    echo -e "\033[33m[WARN] $1\033[0m"
}

log_error() {
    echo -e "\033[31m[ERROR] $1\033[0m"
    exit 1
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

# 补充www域名，适配模板
DOMAIN_WWW="www.$DOMAIN"

# ===================== 安装系统依赖 =====================
log_info "===== 安装必需系统依赖 ====="
apt update -y > /dev/null 2>&1
DEPS=("git" "curl" "jq" "openssl" "docker.io" "certbot" "sshpass" "wget")
for dep in "${DEPS[@]}"; do
    if ! command -v "$dep" &>/dev/null; then
        echo "正在安装 $dep..."
        apt install -y "$dep" > /dev/null 2>&1
    fi
done

# 启动 Docker
systemctl enable docker > /dev/null 2>&1
systemctl start docker > /dev/null 2>&1

# 安装 Docker Compose（若未安装）
if ! docker compose version &>/dev/null; then
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose > /dev/null 2>&1
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# ===================== 安装 Node.js 和 Angular CLI =====================
log_info "===== 安装 Node.js 和 Angular CLI ====="
# 安装 Node.js LTS 20.x
if ! command -v node &>/dev/null; then
    echo "正在安装 Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt install -y nodejs > /dev/null 2>&1
fi

# 安装 Angular CLI
if ! command -v ng &>/dev/null; then
    echo "正在安装 Angular CLI..."
    npm install -g @angular/cli > /dev/null 2>&1
fi

# 验证安装
echo "Node.js 版本：$(node -v)"
echo "npm 版本：$(npm -v)"
echo "Angular CLI 版本：$(ng version --no-progress | grep "Angular CLI" | awk '{print $3}')"

# ===================== 克隆/更新项目仓库 =====================
log_info "===== 克隆/更新项目代码 ====="
mkdir -p "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR" && git pull origin main > /dev/null 2>&1
else
    git clone "https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR" > /dev/null 2>&1
fi

# 创建空的 .env 文件（兜底）
touch "$PROJECT_DIR/.env"
log_info "已创建空的 .env 文件，等待 Workflow 覆盖..."

cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"

# ===================== 构建 Angular 项目 =====================
log_info "===== 构建 Angular 项目 ====="
cd "$CLIENT_DIR"

# 清理旧构建产物，避免缓存问题
rm -rf "$DIST_DIR" || true

# 安装依赖
if [ -f "$CLIENT_DIR/package.json" ]; then
    echo "正在安装 Angular 项目依赖..."
    npm install
    if [ $? -ne 0 ]; then
        log_error "npm install 执行失败！"
    fi
else
    log_error "未找到 package.json：$CLIENT_DIR"
fi

# 检测 Angular 版本
echo "正在检测 Angular 项目版本..."
ANGULAR_VERSION=$(npm list @angular/core --depth=0 2>/dev/null | grep @angular/core | awk -F'@' '{print $3}' | cut -d'.' -f1)
echo "检测到 Angular 主版本：$ANGULAR_VERSION"

# 构建命令
export NODE_OPTIONS=--max-old-space-size=2048
export CI=true
if [ -z "$ANGULAR_VERSION" ] || [ "$ANGULAR_VERSION" -ge 12 ]; then
    BUILD_CMD="ng build --configuration production"
else
    BUILD_CMD="ng build --prod"
fi

# 执行构建
echo "正在执行构建：$BUILD_CMD"
NODE_OPTIONS="--max-old-space-size=2048" $BUILD_CMD

# 验证构建结果
if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR")" ]; then
    log_info "Angular 构建成功：$DIST_DIR"
else
    log_error "Angular 构建失败，目录为空！"
fi

# ===================== 生成 generate-env.sh =====================
log_info "===== 生成 generate-env.sh 脚本 ====="
cat > "$PROJECT_DIR/generate-env.sh" <<'EOF_GENERATE_ENV'
#!/bin/bash
set -e
DOMAIN="$1"
PROJECT_DIR="$2"
cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"
echo -e "\033[32m[INFO] Angular 环境文件复制成功！\033[0m"
EOF_GENERATE_ENV

chmod +x "$PROJECT_DIR/generate-env.sh"
"$PROJECT_DIR/generate-env.sh" "$DOMAIN" "$PROJECT_DIR"

# ===================== 触发 GitHub Workflow =====================
log_info "===== 触发 GitHub Actions Workflow ====="
JSON_PAYLOAD=$(jq -nc \
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

RESPONSE=$(curl -s -X POST \
    -H "Authorization: token $GITHUB_PAT" \
    -H "Accept: application/vnd.github.v3+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
    -d "$JSON_PAYLOAD")

# 结果判断
if [ -z "$RESPONSE" ] || echo "$RESPONSE" | jq -e '.id' &>/dev/null; then
    log_info "GitHub Workflow 触发成功，等待同步 .env 文件..."
    sleep 15
else
    log_warn "Workflow 触发返回信息：$RESPONSE"
fi

# ===== 环境变量兜底（关键修复：补充所有后端必需变量）=====
if [ -f "$PROJECT_DIR/.env" ]; then
    chmod 600 "$PROJECT_DIR/.env"
    log_info ".env 文件权限已设置！"
else
    log_warn ".env 文件未同步，生成默认基础配置..."
    cat > "$PROJECT_DIR/.env" << EOF
# 默认基础环境变量（兜底用）
NODE_ENV=production
PORT=3000
DOMAIN=$DOMAIN
FRONTEND_URL=https://$DOMAIN

# 数据库配置
MONGODB_URI=mongodb://localhost:27017/quoteonline

# JWT配置
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# 邮件配置
EMAIL_HOST=smtp.$DOMAIN
EMAIL_PORT=587
EMAIL_USER=default@$DOMAIN
EMAIL_PASS=default_pass_123
EMAIL_FROM=default@$DOMAIN
ENABLE_QUOTE_EMAIL_NOTIFICATIONS=true

# Mailgun配置（可选）
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_DOMAIN=your_mailgun_domain

# 文件上传配置
UPLOAD_PATH=/app/uploads
MAX_FILE_SIZE=10485760
EOF
    chmod 600 "$PROJECT_DIR/.env"
fi

# ===================== Nginx 配置 & 启动服务（核心修改：统一使用 nginx.conf）=====================
log_info "===== 配置 Nginx 并启动服务 ====="
mkdir -p "$PROJECT_DIR/client"

# ===== 步骤1：生成 HTTP 配置（直接写入 nginx.conf，支持www域名）=====
log_info "生成HTTP版Nginx配置（nginx.conf）..."
cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name $DOMAIN $DOMAIN_WWW;

    root /usr/share/nginx/html;
    index index.html index.htm;

    # 为certbot验证放行路径
    location /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files \$uri \$uri/ =404;
    }

    location /api/ {
        proxy_pass http://backend:3000;
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
log_info "HTTP配置生成成功：$NGINX_CONF"

# ===== 步骤2：修正 Docker Compose 配置 =====
log_info "修正 Docker Compose 配置..."
# 安全移除version属性（仅匹配以version开头的行）
sed -i '/^version/d' "$DOCKER_COMPOSE_FILE" 2>/dev/null
# 确保backend服务显式加载.env文件
sed -i '/services.backend/a \    env_file: .env' "$DOCKER_COMPOSE_FILE" 2>/dev/null
log_info "Docker Compose 配置修正完成"

# ===== 步骤3：启动容器 =====
cd "$PROJECT_DIR"
docker compose down || true
docker compose up -d --build
sleep 5

# 检查容器状态
if ! docker compose ps nginx | grep -q "Up"; then
    log_warn "Nginx容器启动失败，查看日志："
    docker compose logs nginx
    # 尝试启动backend
    if ! docker compose ps backend | grep -q "Up"; then
        log_error "Backend容器也启动失败，无法继续！"
    fi
fi
log_info "容器启动成功（HTTP模式）"

# ===== 步骤4：申请SSL证书（支持www域名，增加容错输出）=====
log_info "申请SSL证书（webroot模式）..."
# 确保验证目录存在并有权限
mkdir -p "$WEBROOT_PATH/.well-known/acme-challenge"
chmod 755 "$WEBROOT_PATH/.well-known/acme-challenge"

# 执行certbot，保留输出便于调试
certbot certonly \
    --webroot \
    -w "$WEBROOT_PATH" \
    -d "$DOMAIN" \
    -d "$DOMAIN_WWW" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email

# 验证证书
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [ ! -f "$CERT_PATH" ]; then
    log_error "SSL证书申请失败：$CERT_PATH 不存在！"
fi
log_info "SSL证书申请成功"

# ===== 步骤5：覆盖生成 HTTPS 配置（直接写入 nginx.conf）=====
log_info "生成正式HTTPS配置（覆盖 nginx.conf）..."

# --------------- 修复：移除外部SSL文件依赖，直接使用模板适配 ---------------
if [ -f "$NGINX_TEMPLATE" ]; then
    # 替换模板变量，移除无效的外部配置引用
    sed -e "s/{{DOMAIN}}/$DOMAIN/g" \
        -e "s|include /etc/letsencrypt/options-ssl-nginx.conf;|# 内置SSL配置，无需外部文件|g" \
        -e "s|ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;|# DH参数已禁用，如需启用请生成文件|g" \
        "$NGINX_TEMPLATE" > "$NGINX_CONF"
    log_info "从模板生成HTTPS配置成功：$NGINX_CONF"
else
    # 生成默认HTTPS配置（支持www域名）
    cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name $DOMAIN $DOMAIN_WWW;

    # 仅放行验证路径，其余重定向
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

    # SSL证书配置
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # 内置SSL优化配置
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";

    # 静态文件配置
    root /usr/share/nginx/html;
    index index.html index.htm;

    # 反向代理后端
    location /api/ {
        proxy_pass http://backend:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Angular单页应用路由
    location / {
        try_files \$uri \$uri/ /index.html;

        # 静态资源缓存
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # HTML不缓存
        location ~* \.html$ {
            expires -1;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
        }
    }

    # 健康检查
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF
fi
log_info "HTTPS配置生成成功：$NGINX_CONF"

# ===== 步骤6：重启Nginx容器（加载HTTPS配置）=====
log_info "重启Nginx容器（HTTPS模式）..."
docker compose restart nginx

# ===== 步骤7：配置证书自动续期 =====
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -
log_info "SSL证书自动续期任务已添加"

# ===================== 验证部署结果 =====================
log_info "===== 验证部署结果 ====="
# 验证.env
if [ -f "$PROJECT_DIR/.env" ]; then
    log_info ".env 文件存在，关键信息："
    cat "$PROJECT_DIR/.env" | grep -E "DOMAIN|MONGODB_URI|JWT_SECRET"
else
    log_error ".env 文件不存在！"
fi

# 验证构建文件
if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR")" ]; then
    log_info "Angular 构建文件存在，数量：$(ls -A "$DIST_DIR" | wc -l)"
else
    log_error "Angular 构建文件为空！"
fi

# 验证证书
if [ -f "$CERT_PATH" ]; then
    log_info "SSL证书存在：$CERT_PATH"
else
    log_error "SSL证书不存在！"
fi

# ===================== 部署完成 =====================
log_info "======================================"
log_info "🎉 全量部署完成！"
log_info "🌍 访问地址：https://$DOMAIN"
log_info "📂 项目路径：$PROJECT_DIR"
log_info "🔧 Nginx配置文件：$NGINX_CONF"
log_info "🔒 SSL证书路径：/etc/letsencrypt/live/$DOMAIN"
log_info "======================================"