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

# ===== 环境变量兜底（关键修复）=====
if [ -f "$PROJECT_DIR/.env" ]; then
    chmod 600 "$PROJECT_DIR/.env"
    log_info ".env 文件权限已设置！"
else
    log_warn ".env 文件未同步，生成默认基础配置..."
    cat > "$PROJECT_DIR/.env" << EOF
# 默认基础环境变量（兜底用）
EMAIL_USER=default@$DOMAIN
EMAIL_PASS=default_pass_123
EMAIL_HOST=smtp.$DOMAIN
EMAIL_PORT=587
MONGODB_URI=mongodb://localhost:27017/quoteonline
DOMAIN=$DOMAIN
EOF
    chmod 600 "$PROJECT_DIR/.env"
fi

# ===================== Nginx 配置 & 启动服务（核心修改：统一使用 nginx.conf）=====================
log_info "===== 配置 Nginx 并启动服务 ====="
mkdir -p "$PROJECT_DIR/client"

# ===== 步骤1：生成 HTTP 配置（直接写入 nginx.conf，无需临时文件）=====
log_info "生成HTTP版Nginx配置（nginx.conf）..."
cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name $DOMAIN;

    root /usr/share/nginx/html;
    index index.html index.htm;

    location /api/ {
        proxy_pass http://quoteonline-backend-1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
    }
}
EOF
log_info "HTTP配置生成成功：$NGINX_CONF"

# ===== 步骤2：修正 Docker Compose 配置 =====
log_info "修正 Docker Compose 配置..."
# 安全移除version属性（仅匹配以version开头的行）
sed -i '/^version/d' "$DOCKER_COMPOSE_FILE" 2>/dev/null
# 无需检查挂载路径，因为docker-compose.yml中已正确配置
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

# 验证Nginx配置中是否包含acme-challenge路径
if ! grep -q "/.well-known/acme-challenge/" "$NGINX_CONF"; then
    log_warn "Nginx配置中缺少acme-challenge路径，自动添加..."
    # 在server块中插入该配置（简单适配，若需更精准可使用sed）
    sed -i "/server_name $DOMAIN;/a \    location /.well-known/acme-challenge/ {\n        root /usr/share/nginx/html;\n    }" "$NGINX_CONF"
    # 重启Nginx容器
    docker compose restart nginx
    sleep 3
fi

# ===== 步骤4：申请SSL证书 =====
log_info "申请SSL证书（webroot模式）..."
mkdir -p "$WEBROOT_PATH"
certbot certonly \
    --webroot \
    -w "$WEBROOT_PATH" \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email > /dev/null 2>&1

# 验证证书
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
if [ ! -f "$CERT_PATH" ]; then
    log_error "SSL证书申请失败：$CERT_PATH 不存在！"
fi
log_info "SSL证书申请成功"

# ===== 步骤5：覆盖生成 HTTPS 配置（直接写入 nginx.conf）=====
log_info "生成正式HTTPS配置（覆盖 nginx.conf）..."

# --------------- 修复1：创建缺失的SSL相关文件 ---------------
# 1. 创建 options-ssl-nginx.conf
SSL_OPTIONS_CONF="/etc/letsencrypt/options-ssl-nginx.conf"
if [ ! -f "$SSL_OPTIONS_CONF" ]; then
    log_info "创建缺失的 SSL 优化配置文件：$SSL_OPTIONS_CONF"
    sudo mkdir -p /etc/letsencrypt
    cat > "$SSL_OPTIONS_CONF" << EOF
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers on;
ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";
EOF
fi

# 2. 创建 ssl-dhparams.pem（用OpenSSL生成，若不存在）
SSL_DHPARAMS_CONF="/etc/letsencrypt/ssl-dhparams.pem"
if [ ! -f "$SSL_DHPARAMS_CONF" ]; then
    log_info "创建缺失的 DH 参数文件：$SSL_DHPARAMS_CONF（生成可能需要1-2分钟）"
    # 生成2048位的DH参数（速度快，兼顾安全），若需更高安全可改为4096（耗时更长）
    sudo openssl dhparam -out "$SSL_DHPARAMS_CONF" 2048 > /dev/null 2>&1
fi

# --------------- 修复2：处理模板中的引用 ---------------
if [ -f "$NGINX_TEMPLATE" ]; then
    # 核心：注释模板中的 options-ssl-nginx.conf 和 ssl-dhparams.pem 引用
    sed -e "s|include /etc/letsencrypt/options-ssl-nginx.conf;|# include /etc/letsencrypt/options-ssl-nginx.conf;|g" \
        -e "s|ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;|# ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;|g" \
        -e "s/{{DOMAIN}}/$DOMAIN/g" \
        "$NGINX_TEMPLATE" > "$NGINX_CONF"
else
    # 生成默认HTTPS配置（内置SSL配置，不依赖外部文件）
    cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL证书配置
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # 内置SSL优化配置（无需外部文件）
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";
    # 若需要DH参数，可取消注释（文件已生成）
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # 静态文件配置
    root /usr/share/nginx/html;
    index index.html index.htm;

    # 反向代理后端
    location /api/ {
        proxy_pass http://quoteonline-backend-1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Angular单页应用路由
    location / {
        try_files \$uri \$uri/ /index.html;
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
    cat "$PROJECT_DIR/.env" | grep -E "EMAIL_FROM|EMAIL_HOST|MONGODB_URI"
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