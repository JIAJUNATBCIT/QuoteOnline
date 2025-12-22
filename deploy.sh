#!/bin/bash
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

# 部署总阶段数
TOTAL_STEPS=11
CURRENT_STEP=0

# ===================== 日志函数（进度清晰+层级化）=====================
log_step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo -e "\n\033[32m[${CURRENT_STEP}/${TOTAL_STEPS}] ===== $1 =====\033[0m"
}

log_info() {
    echo -e "  → $1"
}

log_success() {
    echo -e "  ✓ $1"
}

log_warn() {
    echo -e "\033[33m  ⚠ $1\033[0m"
}

log_error() {
    echo -e "\n\033[31m[ERROR] $1\033[0m"
    exit 1
}

# ===================== 系统检测（核心：自动识别操作系统）=====================
detect_os() {
    # Windows WSL 检测
    if grep -qE "Microsoft|WSL" /proc/version &>/dev/null; then
        OS="Windows-WSL"
        PKG_MANAGER="apt"  # WSL 通常使用 Ubuntu 子系统，默认 apt
        log_info "检测到系统：Windows WSL（Ubuntu 子系统）"
    # RHEL/CentOS 检测
    elif [ -f /etc/redhat-release ]; then
        OS=$(cat /etc/redhat-release | awk '{print $1}')
        # 选择 yum 或 dnf
        if command -v dnf &>/dev/null; then
            PKG_MANAGER="dnf"
        else
            PKG_MANAGER="yum"
        fi
        log_info "检测到系统：$OS，使用包管理器：$PKG_MANAGER"
    # Debian/Ubuntu 检测
    elif [ -f /etc/lsb-release ] || [ -f /etc/debian_version ]; then
        OS=$(lsb_release -si 2>/dev/null || echo "Debian")
        PKG_MANAGER="apt"
        log_info "检测到系统：$OS，使用包管理器：$PKG_MANAGER"
    else
        log_error "不支持的操作系统！仅支持 CentOS/RHEL、Ubuntu/Debian、Windows WSL。"
    fi
}

# ===================== 系统初始化（跨平台适配，增加 firewalld 容错）=====================
init_system() {
    log_step "系统初始化"
    detect_os

    # 1. 包管理器初始化
    if [ "$PKG_MANAGER" = "apt" ]; then
        log_info "更新 Ubuntu/Debian 软件源..."
        apt update -y > /dev/null 2>&1
    elif [ "$PKG_MANAGER" = "yum" ] || [ "$PKG_MANAGER" = "dnf" ]; then
        log_info "安装 EPEL 源（RHEL/CentOS）..."
        $PKG_MANAGER install -y epel-release > /dev/null 2>&1
        log_info "更新 RHEL/CentOS 软件源..."
        # 增加 dnf/yum update 的容错，失败时仅警告
        if ! $PKG_MANAGER update -y > /dev/null 2>&1; then
            log_warn "软件源更新失败，尝试跳过更新继续执行"
        fi
    fi

    # 2. 网络配置（仅 CentOS/RHEL 需要，增加 firewalld 完整容错）
    if [ "$OS" = "CentOS" ] || [ "$OS" = "RedHat" ]; then
        log_info "检查 firewalld 服务状态..."
        # 安装 firewalld（若未安装）
        if ! command -v firewall-cmd &>/dev/null; then
            log_warn "firewalld 未安装，正在安装..."
            $PKG_MANAGER install -y firewalld > /dev/null 2>&1
        fi
        # 启动 firewalld（若未启动）
        if ! systemctl is-active --quiet firewalld; then
            log_warn "firewalld 未启动，正在启动..."
            systemctl enable firewalld > /dev/null 2>&1
            systemctl start firewalld > /dev/null 2>&1
            sleep 2  # 等待服务启动
        fi
        # 开放端口（增加容错，失败时仅警告）
        log_info "开放 80/443 端口（firewalld）..."
        if firewall-cmd --permanent --add-port=80/tcp > /dev/null 2>&1 && firewall-cmd --permanent --add-port=443/tcp > /dev/null 2>&1; then
            firewall-cmd --reload > /dev/null 2>&1
        else
            log_warn "开放端口失败，可能是 firewalld 异常，建议手动检查端口配置"
        fi

        log_info "临时关闭 SELinux..."
        # 增加 SELinux 命令的容错（部分系统可能没有 setenforce）
        if command -v setenforce &>/dev/null; then
            setenforce 0 > /dev/null 2>&1
            sed -i 's/^SELINUX=enforcing$/SELINUX=permissive/' /etc/selinux/config > /dev/null 2>&1
        else
            log_warn "SELINUX 命令未找到，跳过关闭操作"
        fi
    elif [ "$OS" = "Windows-WSL" ]; then
        log_info "Windows WSL 跳过防火墙/SELinux 配置"
    fi

    log_success "系统初始化完成"
}

# ===================== 安装系统依赖（跨平台适配）=====================
install_system_deps() {
    log_step "安装系统依赖"

    # 定义不同系统的依赖包名
    if [ "$PKG_MANAGER" = "apt" ]; then
        DEPS=("git" "curl" "jq" "openssl" "docker.io" "certbot" "sshpass" "wget")
    else
        DEPS=("git" "curl" "jq" "openssl" "certbot" "sshpass" "wget")
    fi

    # 安装基础依赖
    for dep in "${DEPS[@]}"; do
        if ! command -v "$dep" &>/dev/null; then
            log_info "安装 $dep..."
            $PKG_MANAGER install -y "$dep" > /dev/null 2>&1
        fi
    done

    # 安装 Docker（跨平台适配）
    install_docker() {
        if command -v docker &>/dev/null; then
            log_info "Docker 已安装，跳过"
            systemctl enable docker > /dev/null 2>&1
            systemctl start docker > /dev/null 2>&1
            return
        fi

        log_info "安装 Docker..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            # Ubuntu/Debian/WSL 安装 Docker
            apt install -y apt-transport-https ca-certificates gnupg > /dev/null 2>&1
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg > /dev/null 2>&1
            echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null 2>&1
            apt update -y > /dev/null 2>&1
            apt install -y docker-ce docker-ce-cli containerd.io > /dev/null 2>&1
        else
            # RHEL/CentOS 安装 Docker
            $PKG_MANAGER remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine > /dev/null 2>&1
            $PKG_MANAGER install -y yum-utils device-mapper-persistent-data lvm2 > /dev/null 2>&1
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo > /dev/null 2>&1
            $PKG_MANAGER install -y docker-ce docker-ce-cli containerd.io > /dev/null 2>&1
        fi

        # 启动 Docker
        systemctl enable docker > /dev/null 2>&1
        systemctl start docker > /dev/null 2>&1
        log_success "Docker 安装完成"
    }

    # 执行 Docker 安装
    install_docker

    # 安装 Docker Compose（通用）
    if ! docker compose version &>/dev/null; then
        log_info "安装 Docker Compose..."
        mkdir -p /usr/local/lib/docker/cli-plugins
        curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose > /dev/null 2>&1
        chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    fi

    log_success "系统依赖安装完成"
}

# ===================== 安装 Node.js 和 Angular CLI（跨平台适配）=====================
install_node_ng() {
    log_step "安装 Node.js 和 Angular CLI"

    # 安装 Node.js 20.x（跨平台适配）
    if ! command -v node &>/dev/null; then
        log_info "安装 Node.js 20.x..."
        if [ "$PKG_MANAGER" = "apt" ]; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
            apt install -y nodejs > /dev/null 2>&1
        else
            curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
            $PKG_MANAGER install -y nodejs > /dev/null 2>&1
        fi
    else
        log_info "Node.js 已安装，跳过"
    fi

    # 安装 Angular CLI
    if ! command -v ng &>/dev/null; then
        log_info "安装 Angular CLI..."
        npm install -g @angular/cli --registry=https://registry.npmmirror.com > /dev/null 2>&1
    else
        log_info "Angular CLI 已安装，跳过"
    fi

    # 验证安装
    log_info "验证安装版本..."
    NODE_VERSION=$(node -v)
    NPM_VERSION=$(npm -v)
    NG_VERSION=$(ng version --no-progress | grep "Angular CLI" | awk '{print $3}')
    echo -e "    Node.js 版本：$NODE_VERSION"
    echo -e "    npm 版本：$NPM_VERSION"
    echo -e "    Angular CLI 版本：$NG_VERSION"

    log_success "Node.js 环境安装完成"
}

# ===================== 克隆/更新项目仓库 =====================
clone_project() {
    log_step "克隆/更新项目代码"

    log_info "创建项目目录..."
    mkdir -p "$PROJECT_DIR"

    if [ -d "$PROJECT_DIR/.git" ]; then
        log_info "更新现有代码..."
        cd "$PROJECT_DIR" && git pull origin main > /dev/null 2>&1
    else
        log_info "克隆新项目代码..."
        git clone "https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR" > /dev/null 2>&1
    fi

    # 创建日志和上传目录
    log_info "创建日志和上传目录..."
    mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"
    chmod -R 755 "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"
    chown -R root:root "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads"

    # 创建空的 .env 文件
    log_info "创建兜底 .env 文件..."
    touch "$PROJECT_DIR/.env"
    cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"

    log_success "项目代码准备完成"
}

# ===================== 构建 Angular 项目 =====================
build_angular() {
    log_step "构建 Angular 项目"

    log_info "进入 Angular 客户端目录..."
    cd "$CLIENT_DIR"

    # 清理旧构建产物
    log_info "清理旧构建产物..."
    rm -rf "$DIST_DIR" || true

    # 安装依赖
    if [ -f "$CLIENT_DIR/package.json" ]; then
        log_info "安装 Angular 项目依赖..."
        npm install --registry=https://registry.npmmirror.com
        if [ $? -ne 0 ]; then
            log_error "npm install 执行失败！"
        fi
    else
        log_error "未找到 package.json：$CLIENT_DIR"
    fi

    # 检测 Angular 版本
    log_info "检测 Angular 项目版本..."
    ANGULAR_VERSION=$(npm list @angular/core --depth=0 2>/dev/null | grep @angular/core | awk -F'@' '{print $3}' | cut -d'.' -f1)
    log_info "检测到 Angular 主版本：$ANGULAR_VERSION"

    # 构建命令
    export NODE_OPTIONS=--max-old-space-size=2048
    export CI=true
    if [ -z "$ANGULAR_VERSION" ] || [ "$ANGULAR_VERSION" -ge 12 ]; then
        BUILD_CMD="ng build --configuration production"
    else
        BUILD_CMD="ng build --prod"
    fi

    # 执行构建
    log_info "执行构建：$BUILD_CMD"
    NODE_OPTIONS="--max-old-space-size=2048" $BUILD_CMD

    # 验证构建结果
    if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR")" ]; then
        log_success "Angular 构建成功：$DIST_DIR（文件数：$(ls -A "$DIST_DIR" | wc -l)）"
    else
        log_error "Angular 构建失败，目录为空！"
    fi
}

# ===================== 生成环境配置脚本 =====================
generate_env_script() {
    log_step "生成环境配置脚本"

    log_info "写入 generate-env.sh 脚本..."
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

    log_success "环境配置脚本生成完成"
}

# ===================== 触发 GitHub Workflow =====================
trigger_workflow() {
    log_step "触发 GitHub Actions Workflow"

    log_info "构造请求参数..."
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

    log_info "发送触发请求..."
    RESPONSE=$(curl -s -X POST \
        -H "Authorization: token $GITHUB_PAT" \
        -H "Accept: application/vnd.github.v3+json" \
        -H "Content-Type: application/json" \
        "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
        -d "$JSON_PAYLOAD")

    # 结果判断
    if [ -z "$RESPONSE" ] || echo "$RESPONSE" | jq -e '.id' &>/dev/null; then
        log_info "等待 Workflow 同步 .env 文件（15秒）..."
        sleep 15
        log_success "GitHub Workflow 触发成功"
    else
        log_warn "Workflow 触发返回异常信息：$RESPONSE"
    fi

    # 环境变量兜底
    log_info "检查 .env 文件..."
    if [ -f "$PROJECT_DIR/.env" ]; then
        chmod 600 "$PROJECT_DIR/.env"
        log_success ".env 文件存在，权限已设置"
    else
        log_warn "生成默认 .env 配置..."
        cat > "$PROJECT_DIR/.env" << EOF
NODE_ENV=production
PORT=3000
DOMAIN=$DOMAIN
FRONTEND_URL=https://$DOMAIN
MONGODB_URI=mongodb://localhost:27017/quoteonline
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
EMAIL_HOST=smtp.$DOMAIN
EMAIL_PORT=587
EMAIL_PASS=default_pass_123
EMAIL_FROM=default@$DOMAIN
ENABLE_QUOTE_EMAIL_NOTIFICATIONS=true
MAILGUN_API_KEY=your_mailgun_api_key
MAILGUN_DOMAIN=your_mailgun_domain
UPLOAD_PATH=/app/uploads
MAX_FILE_SIZE=10485760
EOF
        chmod 600 "$PROJECT_DIR/.env"
        log_success "默认 .env 配置生成完成"
    fi
}

# ===================== 配置 Nginx 并启动服务 =====================
config_nginx() {
    log_step "配置 Nginx 并启动服务"

    log_info "创建 Nginx 配置目录..."
    mkdir -p "$PROJECT_DIR/client"

    # 生成 HTTP 配置
    log_info "生成 HTTP 版 Nginx 配置..."
    if [ -d "$NGINX_CONF" ]; then
        log_warn "删除无效的目录型配置文件..."
        rm -rf "$NGINX_CONF"
    fi

    cat > "$NGINX_CONF" << EOF
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
    log_info "修正 Docker Compose 配置..."
    sed -i '/^version/d' "$DOCKER_COMPOSE_FILE" 2>/dev/null
    sed -i '/services.backend/a \    env_file: .env' "$DOCKER_COMPOSE_FILE" 2>/dev/null

    # 启动容器
    log_info "启动 Docker 容器..."
    cd "$PROJECT_DIR"
    docker compose down || true
    docker compose up -d --build
    sleep 5

    # 检查容器状态
    if ! docker compose ps nginx | grep -q "Up"; then
        log_warn "Nginx容器启动失败，查看日志："
        docker compose logs nginx
        if ! docker compose ps backend | grep -q "Up"; then
            log_error "Backend容器也启动失败！"
        fi
    fi

    # 申请 SSL 证书
    log_info "申请 SSL 证书..."
    mkdir -p "$WEBROOT_PATH/.well-known/acme-challenge"
    chmod 755 "$WEBROOT_PATH/.well-known/acme-challenge"

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
        log_error "SSL证书申请失败！"
    fi

    # 生成 HTTPS 配置
    log_info "生成 HTTPS 配置..."
    if [ -f "$NGINX_TEMPLATE" ]; then
        sed -e "s/{{DOMAIN}}/$DOMAIN/g" \
            -e "s|include /etc/letsencrypt/options-ssl-nginx.conf;|# 内置SSL配置|g" \
            -e "s|ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;|# DH参数禁用|g" \
            -e "s|proxy_pass http://backend:3000|proxy_pass http://localhost:3000|g" \
            "$NGINX_TEMPLATE" > "$NGINX_CONF"
    else
        cat > "$NGINX_CONF" << EOF
server {
    listen 80;
    server_name $DOMAIN $DOMAIN_WWW;
    location /.well-known/acme-challenge/ { root /usr/share/nginx/html; }
    location / { return 301 https://\$host\$request_uri; }
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
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { expires 1y; add_header Cache-Control "public, immutable"; }
        location ~* \.html$ { expires -1; add_header Cache-Control "no-cache, no-store, must-revalidate"; }
    }

    location /health { access_log off; return 200 "healthy\n"; add_header Content-Type text/plain; }
}
EOF
    fi

    # 重启 Nginx
    log_info "重启 Nginx 容器..."
    docker compose restart nginx

    # 配置证书自动续期
    log_info "添加 SSL 自动续期任务..."
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

    log_success "Nginx 配置完成，HTTPS 服务启动成功"
}

# ===================== 验证部署结果 =====================
verify_deployment() {
    log_step "验证部署结果"

    # 验证 .env 文件
    if [ -f "$PROJECT_DIR/.env" ]; then
        log_info ".env 文件关键信息："
        cat "$PROJECT_DIR/.env" | grep -E "DOMAIN|MONGODB_URI|JWT_SECRET" | sed 's/=/_=/g'
        log_success ".env 文件验证通过"
    else
        log_error ".env 文件不存在！"
    fi

    # 验证构建文件
    if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR")" ]; then
        log_info "Angular 构建文件数量：$(ls -A "$DIST_DIR" | wc -l)"
        log_success "构建文件验证通过"
    else
        log_error "构建文件为空！"
    fi

    # 验证证书
    CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    if [ -f "$CERT_PATH" ]; then
        log_info "SSL证书路径：$CERT_PATH"
        log_success "SSL证书验证通过"
    else
        log_error "SSL证书不存在！"
    fi

    log_success "所有验证项通过"
}

# ===================== 主流程入口 =====================
main() {
    # 获取用户参数
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
    log_success "参数获取完成：域名=$DOMAIN"

    # 执行各阶段
    init_system
    install_system_deps
    install_node_ng
    clone_project
    build_angular
    generate_env_script
    trigger_workflow
    config_nginx
    verify_deployment

    # 部署完成
    log_step "部署完成"
    echo -e "\n\033[32m======================================\033[0m"
    echo -e "\033[32m🎉 全量部署完成！\033[0m"
    echo -e "\033[32m🌍 访问地址：https://$DOMAIN\033[0m"
    echo -e "\033[32m📂 项目路径：$PROJECT_DIR\033[0m"
    echo -e "\033[32m🔧 Nginx配置：$NGINX_CONF\033[0m"
    echo -e "\033[32m======================================\033[0m"
}

# 启动主流程
main