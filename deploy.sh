#!/bin/bash
set -e

PROJECT_DIR="/var/www/QuoteOnline"
CLIENT_DIR="$PROJECT_DIR/client"
DIST_DIR="$CLIENT_DIR/dist/quote-online-client"
WORKFLOW_FILE="deploy-from-clone.yml"
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"

log() { echo -e "\n\033[32m▶ $1\033[0m"; }
err() { echo -e "\n\033[31m❌ $1\033[0m"; exit 1; }

# ===== 系统识别 =====
if command -v apt >/dev/null 2>&1; then
  PKG="apt"
elif command -v dnf >/dev/null 2>&1; then
  PKG="dnf"
elif command -v yum >/dev/null 2>&1; then
  PKG="yum"
else
  err "不支持的系统（找不到 apt / dnf / yum）"
fi

# ===== 输入参数 =====
log "读取部署参数"
read -p "请输入 GitHub PAT（repo + workflow 权限）: " GITHUB_PAT
[ -z "$GITHUB_PAT" ] && err "GitHub PAT 不能为空"

read -p "请输入部署域名（如 portal.ooishipping.com）: " DOMAIN
[ -z "$DOMAIN" ] && err "DOMAIN 不能为空"

# ===== 安装系统依赖 =====
log "安装系统依赖（$PKG）"

if [ "$PKG" = "apt" ]; then
  apt update -y
  apt install -y git curl jq docker.io docker-compose-plugin nodejs npm
else
  $PKG install -y epel-release || true
  $PKG install -y git curl jq docker docker-compose nodejs npm
fi

systemctl enable docker
systemctl start docker

# ===== 克隆 / 更新代码 =====
log "拉取项目代码"
mkdir -p "$PROJECT_DIR"

if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git pull origin main
else
  git clone "https://$GITHUB_USERNAME:$GITHUB_PAT@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR"
fi

# ===== 构建前端 =====
log "构建 Angular 前端"
cd "$CLIENT_DIR"

npm install
npm run build --if-present

[ ! -d "$DIST_DIR" ] && err "Angular 构建失败（dist 不存在）"

# ===== 触发 GitHub Actions =====
log "触发 GitHub Actions（生成 .env）"

WORKFLOW_ID=$(curl -s \
  -H "Authorization: token $GITHUB_PAT" \
  https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows \
  | jq -r --arg f "$WORKFLOW_FILE" '.workflows[] | select(.path | endswith($f)) | .id')

[ -z "$WORKFLOW_ID" ] && err "未找到 workflow"

curl -s -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
  -d "$(jq -nc --arg ref main --arg domain "$DOMAIN" '{ref:$ref, inputs:{domain:$domain}}')"

# ===== 等待 .env =====
log "等待 .env 文件生成（最多 5 分钟）"

WAIT=0
while [ ! -s "$PROJECT_DIR/.env" ]; do
  sleep 3
  WAIT=$((WAIT+3))
  [ $WAIT -ge 300 ] && err ".env 超时未生成（GitHub Actions 失败）"
done

chmod 600 "$PROJECT_DIR/.env"
log ".env 已就绪"

# ===== 启动 Docker =====
log "启动 Docker"
cd "$PROJECT_DIR"
docker compose down || true
docker compose up -d --build

log "🎉 部署完成"
echo "👉 https://$DOMAIN"
