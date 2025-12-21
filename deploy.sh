#!/bin/bash
set -e

# 接收用户输入：domain 和 PAT
read -p "请输入你的域名 (例如 portal.ooishipping.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
  echo -e "\033[31m【错误】域名不能为空！\033[0m"
  exit 1
fi

read -p "请输入你的 GitHub PAT (个人访问令牌): " GITHUB_PAT
if [ -z "$GITHUB_PAT" ]; then
  echo -e "\033[31m【错误】PAT 不能为空！\033[0m"
  exit 1
fi

read -p "请输入服务器 IP: " SERVER_IP
if [ -z "$SERVER_IP" ]; then
  echo -e "\033[31m【错误】服务器 IP 不能为空！\033[0m"
  exit 1
fi

# 触发 GitHub Actions workflow（需替换为你的仓库信息）
OWNER="JIAJUNATBCIT"  # 你的 GitHub 用户名
REPO="QuoteOnline"    # 你的仓库名
WORKFLOW_ID="deploy-from-clone.yml"  # workflow 文件名

echo "=== 触发部署 workflow ==="
curl -L \
  -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/$OWNER/$REPO/actions/workflows/$WORKFLOW_ID/dispatches \
  -d "{
    \"ref\": \"main\",  # 触发 workflow 的分支
    \"inputs\": {
      \"server_ip\": \"$SERVER_IP\",
      \"github_pat\": \"$GITHUB_PAT\",
      \"domain\": \"$DOMAIN\"
    }
  }"

echo "=== workflow 已触发，请前往 GitHub Actions 查看进度 ==="