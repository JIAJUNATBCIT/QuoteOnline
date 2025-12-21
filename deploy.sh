#!/bin/bash
set -e

# ===================== 基础配置 =====================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
PROJECT_DIR="/var/www/QuoteOnline"
CLIENT_DIR="$PROJECT_DIR/client"  # Angular 客户端目录
DIST_DIR="$CLIENT_DIR/dist/quote-online-client"  # 构建输出目录
WORKFLOW_ID="deploy-from-clone.yml"

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

# ===================== 安装系统依赖 =====================
echo -e "\033[32m===== 安装必需系统依赖 =====\033[0m"
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

# ===================== 安装 Node.js 和 Angular CLI（核心：Angular 构建依赖）=====================
echo -e "\033[32m===== 安装 Node.js 和 Angular CLI =====\033[0m"
# 安装 Node.js LTS 版本（20.x），适配大多数 Angular 项目
if ! command -v node &>/dev/null; then
    echo "正在安装 Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt install -y nodejs > /dev/null 2>&1
fi

# 安装 Angular CLI（全局）
if ! command -v ng &>/dev/null; then
    echo "正在安装 Angular CLI..."
    npm install -g @angular/cli > /dev/null 2>&1
fi

# 验证安装
echo "Node.js 版本：$(node -v)"
echo "npm 版本：$(npm -v)"
echo "Angular CLI 版本：$(ng version --no-progress | grep "Angular CLI" | awk '{print $3}')"

# ===================== 克隆/更新项目仓库 =====================
echo -e "\033[32m===== 克隆/更新项目代码 =====\033[0m"
mkdir -p "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/.git" ]; then
    cd "$PROJECT_DIR" && git pull origin main > /dev/null 2>&1
else
    git clone "https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR" > /dev/null 2>&1
fi

# ===== 创建空的 .env 文件，避免后续权限操作报错 =====
touch "$PROJECT_DIR/.env"
echo -e "✅ 已创建空的 .env 文件，等待 Workflow 覆盖..."

cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"

# ===================== 安装 Angular 项目依赖并执行构建（核心：生成 dist 文件）=====================
echo -e "\033[32m===== 构建 Angular 项目 =====\033[0m"
cd "$CLIENT_DIR"

# 安装项目依赖（npm install），保留输出以便排查依赖问题
if [ -f "$CLIENT_DIR/package.json" ]; then
    echo "正在安装 Angular 项目依赖..."
    # 去掉输出重定向，显示依赖安装日志
    npm install
    # 检查 npm install 是否失败
    if [ $? -ne 0 ]; then
        echo -e "\033[31m【错误】npm install 执行失败，依赖安装不完整！\033[0m"
        exit 1
    fi
else
    echo -e "\033[31m【错误】未找到 Angular 项目的 package.json：$CLIENT_DIR\033[0m"
    exit 1
fi

# 检测 Angular 项目版本，自动适配构建参数
echo "正在检测 Angular 项目版本..."
# 从 package.json 中提取 @angular/core 版本
ANGULAR_VERSION=$(npm list @angular/core --depth=0 2>/dev/null | grep @angular/core | awk -F'@' '{print $3}' | cut -d'.' -f1)
echo "检测到 Angular 主版本：$ANGULAR_VERSION"

# 定义构建命令（适配不同版本）
if [ -z "$ANGULAR_VERSION" ] || [ "$ANGULAR_VERSION" -ge 12 ]; then
    # Angular 12+ 使用 --configuration production
    BUILD_CMD="CI=true ng build --configuration production"
else
    # Angular 11 及以下使用 --prod
    BUILD_CMD="ng build --prod"
fi

# 执行构建（保留详细日志，针对低配服务器增加内存限制）
echo "正在执行 Angular 生产环境构建，命令：$BUILD_CMD"
# 增加 Node.js 内存限制（如 2GB），避免 OOM 错误
NODE_OPTIONS="--max-old-space-size=2048" $BUILD_CMD

# 检查构建是否成功
if [ $? -ne 0 ]; then
    echo -e "\033[31m【错误】Angular 构建失败，请查看以上日志排查问题！\033[0m"
    exit 1
fi

# 验证构建文件是否生成
if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR")" ]; then
    echo -e "✅ Angular 项目构建成功，输出目录：$DIST_DIR"
else
    echo -e "\033[31m【错误】Angular 构建失败，$DIST_DIR 目录为空！\033[0m"
    exit 1
fi

# ===================== 生成简化版 generate-env.sh（仅处理Angular环境文件）=====================
echo -e "\033[32m===== 生成 generate-env.sh 脚本 =====\033[0m"
cat > "$PROJECT_DIR/generate-env.sh" <<'EOF_GENERATE_ENV'
#!/bin/bash
set -e

# 接收外部参数
DOMAIN="$1"
PROJECT_DIR="$2"

# 复制 Angular 环境文件（解决模块引用问题）
cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"
echo -e "\033[32m✅ Angular 环境文件复制成功！\033[0m"
EOF_GENERATE_ENV

# 赋予执行权限
chmod +x "$PROJECT_DIR/generate-env.sh"

# ===================== 运行 generate-env.sh =====================
echo -e "\033[32m===== 执行 generate-env.sh =====\033[0m"
"$PROJECT_DIR/generate-env.sh" "$DOMAIN" "$PROJECT_DIR"

# ===================== 触发 GitHub Workflow（生成完整 .env）=====================
echo -e "\033[32m===== 触发 GitHub Actions Workflow（获取完整环境变量）=====\033[0m"
# 用 jq 构造合法 JSON
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

# 发送请求
RESPONSE=$(curl -s -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
  -d "$JSON_PAYLOAD")

# 结果判断
if [ -z "$RESPONSE" ] || echo "$RESPONSE" | jq -e '.id' &>/dev/null; then
  echo -e "✅ GitHub Workflow 触发成功，正在同步完整 .env 文件..."
  sleep 15  # 等待 Workflow 执行完成

  # ===== 判断 .env 是否存在并设置权限 =====
  if [ -f "$PROJECT_DIR/.env" ]; then
    chmod 600 "$PROJECT_DIR/.env"
    echo -e "✅ .env 文件权限已设置！"
  else
    echo -e "\033[33m【警告】.env 文件仍未同步，可能 Workflow 执行失败，请检查 GitHub Actions 日志\033[0m"
  fi
else
  echo -e "\033[33m【警告】Workflow 触发返回信息：$RESPONSE\033[0m"
fi

# ===================== Nginx 配置 & 启动服务 =====================
echo -e "\033[32m===== 配置 Nginx 并启动服务 =====\033[0m"
TEMPLATE="$PROJECT_DIR/client/nginx.conf.template"  # 定义模板文件路径
NGINX_CONF="$PROJECT_DIR/client/nginx.conf"          # 定义目标配置文件路径

# 核心修复：静默删除目标路径（避免目录冲突）
rm -rf "$NGINX_CONF" 2>/dev/null

# 确保 client 目录存在（为配置文件提供存放路径）
mkdir -p "$PROJECT_DIR/client"

# ===== 【核心生成步骤】从模板生成 nginx.conf =====
if [ -f "$TEMPLATE" ]; then
    # 这一行是真正生成 nginx.conf 文件的命令
    sed "s/{{DOMAIN}}/$DOMAIN/g" "$TEMPLATE" > "$NGINX_CONF"
    echo -e "✅ Nginx 配置文件生成成功：$NGINX_CONF"
else
    echo -e "\033[33m【警告】未找到 Nginx 模板文件：$TEMPLATE，跳过 Nginx 配置\033[0m"
fi

# ===== 启动容器 & 申请 SSL =====
cd "$PROJECT_DIR"
docker compose up -d --build > /dev/null 2>&1
docker compose stop nginx > /dev/null 2>&1

# 申请 SSL 证书
certbot certonly --standalone \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email > /dev/null 2>&1

# 配置 SSL 自动续期
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

# 启动 Nginx
docker compose start nginx > /dev/null 2>&1
echo -e "✅ Nginx 服务启动成功！"

# ===================== 验证关键文件 =====================
echo -e "\033[32m===== 验证部署结果 =====\033[0m"
# 验证 .env 文件
if [ -f "$PROJECT_DIR/.env" ]; then
    echo -e "✅ .env 文件存在，包含关键信息："
    cat "$PROJECT_DIR/.env" | grep -E "EMAIL_FROM|EMAIL_HOST|EMAIL_PORT|MONGODB_URI"
else
    echo -e "\033[31m【错误】.env 文件不存在！\033[0m"
    exit 1
fi

# 验证 Angular 构建文件
if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR")" ]; then
    echo -e "✅ Angular 构建文件存在，文件数量：$(ls -A "$DIST_DIR" | wc -l)"
else
    echo -e "\033[31m【错误】Angular 构建文件为空！\033[0m"
    exit 1
fi

# ===================== 部署完成 =====================
echo -e "\033[32m======================================\033[0m"
echo -e "\033[32m🎉 全量部署完成！\033[0m"
echo -e "\033[32m🌍 访问地址：https://$DOMAIN\033[0m"
echo -e "\033[32m📂 项目路径：$PROJECT_DIR\033[0m"
echo -e "\033[32m📦 Angular 构建目录：$DIST_DIR\033[0m"
echo -e "\033[32m======================================\033[0m"