#!/bin/bash
set -e

PROJECT_DIR="/var/www/QuoteOnline"
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
WORKFLOW_FILE="deploy-from-clone.yml"

# 1. 安装基础依赖
apt update -y
apt install -y git curl jq docker.io

systemctl enable docker
systemctl start docker

# 2. clone / update 代码
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git pull origin main
else
  rm -rf "$PROJECT_DIR"
  git clone https://github.com/$GITHUB_USERNAME/$GITHUB_REPO.git "$PROJECT_DIR"
fi

# 3. 触发 GitHub Actions
read -s -p "GitHub PAT(repo + workflow): " GITHUB_PAT
echo

SERVER_IP=$(curl -s ifconfig.me)

WORKFLOW_ID=$(curl -s \
  -H "Authorization: token $GITHUB_PAT" \
  https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows \
  | jq -r '.workflows[] | select(.path | endswith("'$WORKFLOW_FILE'")) | .id')

curl -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches \
  -d "$(jq -nc --arg ip "$SERVER_IP" '{ref:"main", inputs:{server_ip:$ip}}')"

echo "✅ Deployment triggered"
