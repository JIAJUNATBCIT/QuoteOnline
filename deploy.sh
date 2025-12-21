#!/bin/bash
set -e

echo "===== QuoteOnline One-Click Deploy ====="

PROJECT_DIR="/var/www/QuoteOnline"
GITHUB_REPO="https://github.com/JIAJUNATBCIT/QuoteOnline.git"
WORKFLOW_FILE="Deploy from Clone"

# -------------------------
# 1️⃣ 交互输入
# -------------------------
read -p "请输入域名 (例如 portal.ooishipping.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
  echo "❌ DOMAIN 不能为空"
  exit 1
fi

SERVER_IP=$(curl -s ifconfig.me)

# -------------------------
# 2️⃣ 安装系统依赖
# -------------------------
echo "===== 安装依赖 ====="
apt update -y
apt install -y git curl jq docker.io docker-compose-plugin sshpass

systemctl enable docker
systemctl start docker

# -------------------------
# 3️⃣ 拉取 / 更新代码
# -------------------------
mkdir -p /var/www
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git pull origin main
else
  rm -rf "$PROJECT_DIR"
  git clone "$GITHUB_REPO" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

# -------------------------
# 4️⃣ 生成 nginx.conf（替换域名）
# -------------------------
echo "===== 生成 nginx.conf ====="
sed "s/{{DOMAIN}}/$DOMAIN/g" \
  client/nginx.conf.template > client/nginx.conf

# -------------------------
# 5️⃣ 触发 GitHub Actions（生成 .env）
# -------------------------
echo "===== 触发 GitHub Actions ====="

read -s -p "请输入 GitHub PAT (repo + workflow 权限): " GITHUB_PAT
echo

WORKFLOW_ID=$(curl -s \
  -H "Authorization: token $GITHUB_PAT" \
  https://api.github.com/repos/JIAJUNATBCIT/QuoteOnline/actions/workflows \
  | jq -r '.workflows[] | select(.name=="Deploy from Clone") | .id')

if [ -z "$WORKFLOW_ID" ]; then
  echo "❌ 找不到 workflow"
  exit 1
fi

curl -s -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/JIAJUNATBCIT/QuoteOnline/actions/workflows/$WORKFLOW_ID/dispatches \
  -d "$(jq -nc \
    --arg ip "$SERVER_IP" \
    --arg domain "$DOMAIN" \
    '{ref:"main", inputs:{server_ip:$ip, domain:$domain}}')"

echo "✅ 已触发 GitHub Actions"

echo
echo "👉 等待 GitHub Actions 完成后，服务器将自动生成 .env 并启动容器"
echo "👉 可查看 Actions 页面确认状态"
