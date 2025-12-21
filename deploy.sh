#!/bin/bash
set -e

# ===================== 基础配置（无需用户修改）=====================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
PROJECT_DIR="/var/www/QuoteOnline"
WORKFLOW_ID="deploy-from-clone.yml"  # 也可替换为 Workflow 的数字 ID（更稳定）

# ===================== 自动获取服务器IP =====================
echo -e "\033[32m===== 自动获取服务器IP =====\033[0m"
SERVER_IP=$(curl -s --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    echo -e "\033[31m【错误】无法自动获取服务器IP，请手动输入：\033[0m"
    read -p "服务器IP: " SERVER_IP
    if [ -z "$SERVER_IP" ]; then
        exit 1
    fi
fi
echo -e "✅ 服务器IP已获取：$SERVER_IP"

# ===================== 用户输入参数 =====================
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

# ===================== 安装系统依赖（已包含 jq）=====================
echo -e "\033[32m===== 安装必需系统依赖 =====\033[0m"
apt update -y > /dev/null 2>&1
DEPS=("git" "curl" "jq" "openssl" "docker.io" "docker-compose" "certbot" "sshpass")
for dep in "${DEPS[@]}"; do
    if ! command -v "$dep" &>/dev/null; then
        echo "正在安装 $dep..."
        apt install -y "$dep" > /dev/null 2>&1
    fi
done
systemctl enable docker > /dev/null 2>&1
systemctl start docker > /dev/null 2>&1

# ===================== 克隆/更新项目仓库 =====================
echo -e "\033[32m===== 克隆/更新项目代码 =====\033[0m"
mkdir -p "$PROJECT_DIR"
if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR" && git pull origin main > /dev/null 2>&1
else
    git clone "https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR" > /dev/null 2>&1
fi

# ===================== 生成 generate-env.sh 脚本 =====================
echo -e "\033[32m===== 生成 generate-env.sh 脚本 =====\033[0m"
cat > "$PROJECT_DIR/generate-env.sh" <<'EOF_GENERATE_ENV'
#!/bin/bash
set -e

# 接收外部参数
DOMAIN="$1"
SERVER_IP="$2"
PROJECT_DIR="$3"

# 敏感信息（后续从 Workflow 传递）
MONGODB_URI="${MONGODB_URI:-default_mongodb_uri}"
JWT_SECRET="${JWT_SECRET:-default_jwt_secret}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-default_refresh_secret}"
EMAIL_PASS="${EMAIL_PASS:-default_email_pass}"
MAILGUN_API_KEY="${MAILGUN_API_KEY:-default_mailgun_key}"

# 非敏感信息
EMAIL_FROM="sales@junbclistings.com"
EMAIL_HOST="smtp.exmail.qq.com"
EMAIL_PORT="465"
ENABLE_QUOTE_EMAIL_NOTIFICATIONS="true"
MAILGUN_DOMAIN="junbclistings.com"

# 生成 .env 文件
echo -e "\033[32m===== 开始生成 .env 文件 =====\033[0m"
cat > "$PROJECT_DIR/.env" <<EOF_ENV
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
EOF_ENV

chmod 600 "$PROJECT_DIR/.env"
cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"
echo -e "\033[32m✅ .env 文件生成成功！\033[0m"
EOF_GENERATE_ENV

# 赋予执行权限
chmod +x "$PROJECT_DIR/generate-env.sh"

# ===================== 自动运行 generate-env.sh =====================
echo -e "\033[32m===== 执行 generate-env.sh 生成 .env 文件 =====\033[0m"
"$PROJECT_DIR/generate-env.sh" "$DOMAIN" "$SERVER_IP" "$PROJECT_DIR"

# ===================== 触发 GitHub Workflow（核心修复：用 jq 构造 JSON）=====================
echo -e "\033[32m===== 触发 GitHub Actions Workflow =====\033[0m"
# 用 jq 构造合法的 JSON 请求体
JSON_PAYLOAD=$(jq -nc \
  --arg ref "main" \
  --arg server_ip "$SERVER_IP" \
  --arg domain "$DOMAIN" \
  --arg github_pat "$GITHUB_PAT" \
  '{
    ref: $ref,
    inputs: {
      server_ip: $server_ip,
      domain: $domain,
      github_pat: $github_pat
    }
  }')

# 发送 POST 请求
RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
  -d "$JSON_PAYLOAD")

# 结果判断
if [ -z "$RESPONSE" ] || echo "$RESPONSE" | jq -e '.id' &>/dev/null; then
  echo -e "✅ GitHub Workflow 触发成功，等待执行..."
  sleep 10
else
  echo -e "\033[33m【警告】Workflow 触发返回信息：$RESPONSE\033[0m"
fi

# ===================== Nginx 配置 & 启动服务 =====================
echo -e "\033[32m===== 配置 Nginx 并启动服务 =====\033[0m"
TEMPLATE="$PROJECT_DIR/client/nginx.conf.template"
NGINX_CONF="$PROJECT_DIR/client/nginx.conf"
if [ -f "$TEMPLATE" ]; then
  sed "s/{{DOMAIN}}/$DOMAIN/g" "$TEMPLATE" > "$NGINX_CONF"
else
  echo -e "\033[33m【警告】未找到 Nginx 模板文件，跳过配置\033[0m"
fi

# 启动容器 & 申请 SSL
cd "$PROJECT_DIR"
docker compose up -d --build > /dev/null 2>&1
docker compose stop nginx > /dev/null 2>&1
certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email > /dev/null 2>&1
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -
docker compose start nginx > /dev/null 2>&1

# ===================== 部署完成 =====================
echo -e "\033[32m======================================\033[0m"
echo -e "\033[32m🎉 全量部署完成！\033[0m"
echo -e "\033[32m🌍 访问地址：https://$DOMAIN\033[0m"
echo -e "\033[32m📂 项目路径：$PROJECT_DIR\033[0m"
echo -e "\033[32m======================================\033[0m"