#!/usr/bin/env bash
set -e

echo "=========================================="
echo "  QuoteOnline One-Click Deploy (方案 2)"
echo "=========================================="

# -----------------------------
# 1. 读取部署参数
# -----------------------------
echo ""
echo "▶ 读取部署参数"

read -p "请输入你的域名（例如 portal.ooishipping.com）: " DOMAIN
if [[ -z "$DOMAIN" ]]; then
  echo "❌ DOMAIN 不能为空"
  exit 1
fi

read -s -p "请输入你的 GitHub PAT（用于 clone 私有仓库）: " GITHUB_PAT
echo ""
if [[ -z "$GITHUB_PAT" ]]; then
  echo "❌ GitHub PAT 不能为空"
  exit 1
fi

export DOMAIN
export DOMAIN_WWW="www.$DOMAIN"

# -----------------------------
# 2. 检测系统 & 安装依赖
# -----------------------------
echo ""
echo "▶ 安装系统依赖"

if command -v apt >/dev/null 2>&1; then
  echo "  使用 apt (Ubuntu / Debian)"
  apt update -y
  apt install -y git curl jq ca-certificates gnupg lsb-release

  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
  fi

elif command -v dnf >/dev/null 2>&1; then
  echo "  使用 dnf (CentOS / Rocky / Alma)"
  dnf install -y epel-release
  dnf install -y git curl jq ca-certificates

  if ! command -v docker >/dev/null 2>&1; then
    dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    dnf install -y docker-ce docker-ce-cli containerd.io
    systemctl enable --now docker
  fi
else
  echo "❌ 不支持的 Linux 发行版"
  exit 1
fi

# Docker Compose plugin
if ! docker compose version >/dev/null 2>&1; then
  echo "▶ 安装 docker compose plugin"
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

# -----------------------------
# 3. 关闭宿主机占用 80/443
# -----------------------------
echo ""
echo "▶ 释放 80 / 443 端口"

systemctl stop nginx 2>/dev/null || true
systemctl stop apache2 2>/dev/null || true
docker ps -q --filter "publish=80" | xargs -r docker stop
docker ps -q --filter "publish=443" | xargs -r docker stop

# -----------------------------
# 4. Clone / 更新项目
# -----------------------------
PROJECT_DIR="/var/www/QuoteOnline"
REPO_URL="https://$GITHUB_PAT@github.com/JIAJUNATBCIT/QuoteOnline.git"

echo ""
echo "▶ 同步项目代码"

mkdir -p /var/www
cd /var/www

if [[ ! -d "$PROJECT_DIR/.git" ]]; then
  git clone "$REPO_URL" QuoteOnline
else
  cd QuoteOnline
  git fetch origin
  git reset --hard origin/main
fi

cd "$PROJECT_DIR"

# -----------------------------
# 5. 写入 DOMAIN 标记文件
# （供 workflow / nginx 使用）
# -----------------------------
echo ""
echo "▶ 写入域名配置"

echo "$DOMAIN" > .domain

# -----------------------------
# 6. 启动基础容器（等待 .env）
# -----------------------------
echo ""
echo "▶ 启动 Docker 服务（等待 GitHub Actions 下发 .env）"

docker compose pull
docker compose up -d

# -----------------------------
# 7. 触发 GitHub Actions 部署
# -----------------------------
echo ""
echo "▶ 触发 GitHub Actions workflow"

curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_PAT" \
  https://api.github.com/repos/JIAJUNATBCIT/QuoteOnline/actions/workflows/deploy-from-clone.yml/dispatches \
  -d @- <<EOF
{
  "ref": "main",
  "inputs": {
    "domain": "$DOMAIN"
  }
}
EOF

echo ""
echo "=========================================="
echo "✅ 部署流程已启动"
echo ""
echo "下一步："
echo "1️⃣ 等待 GitHub Actions 完成（生成并上传 .env）"
echo "2️⃣ 容器将自动 restart"
echo "3️⃣ 访问：https://$DOMAIN"
echo "=========================================="
