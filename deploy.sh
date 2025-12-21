#!/bin/bash
set -e

# ===================== 基础配置（无需用户修改）=====================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
PROJECT_DIR="/var/www/QuoteOnline"
WORKFLOW_ID="deploy-from-clone.yml"  # GitHub Workflow 文件名/ID

# ===================== 自动获取服务器IP（核心优化：无需用户输入）=====================
echo -e "\033[32m===== 自动获取服务器IP =====\033[0m"
# 优先获取公网IP（通过 ifconfig.me），失败则获取内网IP
SERVER_IP=$(curl -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    echo -e "\033[31m【错误】无法自动获取服务器IP，请手动输入：\033[0m"
    read -p "服务器IP: " SERVER_IP
    if [ -z "$SERVER_IP" ]; then
        exit 1
    fi
fi
echo -e "✅ 服务器IP已获取：$SERVER_IP"

# ===================== 仅需用户输入2个参数：GitHub PAT + 域名 =====================
read -p "请输入你的 GitHub PAT（个人访问令牌）: " GITHUB_PAT
if [ -z "$GITHUB_PAT" ]; then
    echo -e "\033[31m【错误】GitHub PAT 不能为空！\033[0m"
    exit 1
fi

read -p "请输入你的域名（例如 portal.ooishipping.com）: " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "\033[31m【错误】域名不能为空！\033[0m"
    exit 1
fi

# ===================== 安装系统依赖 =====================
echo -e "\033[32m===== 安装必需系统依赖 =====\033[0m"
apt update -y > /dev/null 2>&1

# 定义需要安装的依赖列表
DEPS=("git" "curl" "jq" "openssl" "docker.io" "docker-compose" "certbot" "sshpass")
for dep in "${DEPS[@]}"; do
    if ! command -v "$dep" &>/dev/null; then
        echo "正在安装 $dep..."
        apt install -y "$dep" > /dev/null 2>&1
    fi
done

# 启动并启用 Docker
systemctl enable docker > /dev/null 2>&1
systemctl start docker > /dev/null 2>&1

# 验证 Docker Compose
if ! docker compose version &>/dev/null; then
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose > /dev/null 2>&1
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# ===================== 克隆/更新项目仓库 =====================
echo -e "\033[32m===== 克隆/更新项目代码 =====\033[0m"
mkdir -p "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/.git" ]; then
    # 已有仓库，执行更新
    cd "$PROJECT_DIR" && git pull origin main > /dev/null 2>&1
else
    # 首次克隆，使用 PAT 访问私有仓库
    git clone "https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR" > /dev/null 2>&1
fi

# ===================== 生成 generate-env.sh 脚本（核心：包含.env生成逻辑）=====================
echo -e "\033[32m===== 生成 generate-env.sh 脚本 =====\033[0m"
cat > "$PROJECT_DIR/generate-env.sh" <<'EOF_GENERATE_ENV'
#!/bin/bash
set -e

# 接收外部传入的参数
DOMAIN="$1"
SERVER_IP="$2"
PROJECT_DIR="$3"

# （可选）若需要从 GitHub Secrets 获取敏感信息，可在此处通过 API 拉取
# 本示例中先通过变量占位，实际可替换为从 Workflow 传递的敏感信息
# 敏感信息（后续可从 GitHub Workflow 传递到该脚本）
MONGODB_URI="${MONGODB_URI:-default_mongodb_uri}"
JWT_SECRET="${JWT_SECRET:-default_jwt_secret}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-default_refresh_secret}"
EMAIL_PASS="${EMAIL_PASS:-default_email_pass}"
MAILGUN_API_KEY="${MAILGUN_API_KEY:-default_mailgun_key}"

# 非敏感信息（从参数/配置中获取）
EMAIL_FROM="sales@junbclistings.com"
EMAIL_HOST="smtp.exmail.qq.com"
EMAIL_PORT="465"
ENABLE_QUOTE_EMAIL_NOTIFICATIONS="true"
MAILGUN_DOMAIN="junbclistings.com"

# ===================== 生成 .env 文件 =====================
echo -e "\033[32m===== 开始生成 .env 文件 =====\033[0m"
cat > "$PROJECT_DIR/.env" <<EOF_ENV
# 基础环境配置
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://$DOMAIN
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# 敏感信息（从 GitHub Secrets 传递）
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
EOF_ENV

# 设置 .env 文件权限（仅所有者可读写）
chmod 600 "$PROJECT_DIR/.env"

# 复制 Angular 环境文件（解决模块引用问题）
cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"

echo -e "\033[32m✅ .env 文件生成成功！\033[0m"
EOF_GENERATE_ENV

# 赋予 generate-env.sh 执行权限
chmod +x "$PROJECT_DIR/generate-env.sh"

# ===================== 自动运行 generate-env.sh 生成 .env（核心步骤）=====================
echo -e "\033[32m===== 执行 generate-env.sh 生成 .env 文件 =====\033[0m"
# 传递参数：域名、服务器IP、项目目录
"$PROJECT_DIR/generate-env.sh" "$DOMAIN" "$SERVER_IP" "$PROJECT_DIR"

# ===================== 触发 GitHub Workflow（传递参数，拉取敏感信息）=====================
echo -e "\033[32m===== 触发 GitHub Actions Workflow =====\033[0m"
RESPONSE=$(curl -s -X POST \
    -H "Authorization: token $GITHUB_PAT" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
    -d "{
        \"ref\": \"main\",
        \"inputs\": {
            \"server_ip\": \"$SERVER_IP\",
            \"domain\": \"$DOMAIN\"
        }
    }")

if [ -z "$RESPONSE" ]; then
    echo -e "✅ GitHub Workflow 触发成功，等待敏感信息同步..."
    sleep 10
else
    echo -e "\033[33m【警告】Workflow 触发返回信息：$RESPONSE\033[0m"
fi

# ===================== Nginx 配置 =====================
echo -e "\033[32m===== 配置 Nginx =====\033[0m"
TEMPLATE="$PROJECT_DIR/client/nginx.conf.template"
NGINX_CONF="$PROJECT_DIR/client/nginx.conf"

if [ -f "$TEMPLATE" ]; then
    # 替换模板中的域名占位符
    sed "s/{{DOMAIN}}/$DOMAIN/g" "$TEMPLATE" > "$NGINX_CONF"
else
    echo -e "\033[33m【警告】未找到 Nginx 模板文件，跳过配置\033[0m"
fi

# ===================== 启动服务并申请 SSL =====================
echo -e "\033[32m===== 启动项目服务 =====\033[0m"
cd "$PROJECT_DIR"

# 构建并启动容器（先停止 Nginx 以便申请 SSL）
docker compose up -d --build > /dev/null 2>&1
docker compose stop nginx > /dev/null 2>&1

# 申请 SSL 证书
echo -e "\033[32m===== 申请 SSL 证书 =====\033[0m"
certbot certonly --standalone \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --register-unsafely-without-email > /dev/null 2>&1

# 配置 SSL 自动续期
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

# 启动 Nginx
docker compose start nginx > /dev/null 2>&1

# ===================== 部署完成 =====================
echo -e "\033[32m======================================\033[0m"
echo -e "\033[32m🎉 全量部署完成！\033[0m"
echo -e "\033[32m🌍 访问地址：https://$DOMAIN\033[0m"
echo -e "\033[32m📂 项目路径：$PROJECT_DIR\033[0m"
echo -e "\033[32m💡 可通过 docker ps 查看容器状态\033[0m"
echo -e "\033[32m======================================\033[0m"