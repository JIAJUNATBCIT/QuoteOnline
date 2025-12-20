#!/bin/bash
set -e  # 遇到错误立即退出，保证脚本健壮性

# ===================== 配置项（可根据自己的情况修改默认值）=====================
# 默认GitHub用户名（可通过参数覆盖，也可直接修改这里）
DEFAULT_GITHUB_USERNAME="JIAJUNATBCIT"
# 默认GitHub注册邮箱（可通过参数覆盖，也可直接修改这里）
DEFAULT_GITHUB_EMAIL="jiajuncai7@gmail.com"
# 默认仓库HTTPS地址（可根据自己的仓库修改）
DEFAULT_REPO_URL="https://github.com/JIAJUNATBCIT/QuoteOnline.git"
# =============================================================================

# ===================== 参数接收与校验 =====================
# 第一个参数：必填，GitHub PAT
GITHUB_PAT="$1"
# 第二个参数：可选，GitHub用户名（不传则用默认值）
GITHUB_USERNAME="${2:-$DEFAULT_GITHUB_USERNAME}"
# 第三个参数：可选，GitHub邮箱（不传则用默认值）
GITHUB_EMAIL="${3:-$DEFAULT_GITHUB_EMAIL}"

# 校验：如果未传入PAT，打印使用提示并退出
if [ -z "$GITHUB_PAT" ]; then
    echo "【错误】请传入GitHub Personal Access Token(PAT)作为第一个参数"
    echo "使用方法："
    echo "  ./github-setup.sh <你的PAT>"
    echo "示例："
    echo "  ./github-setup.sh ghp_xxxxxx"
    exit 1
fi

# ===================== 开始配置 =====================
echo "===== 开始配置Git无密码连接GitHub ====="

# 1. 配置Git全局用户信息（提交身份）
echo "1. 配置Git用户信息:$GITHUB_USERNAME / $GITHUB_EMAIL"
git config --global user.name "$GITHUB_USERNAME"
git config --global user.email "$GITHUB_EMAIL"

# 2. 配置Git凭证助手为store（永久保存PAT到本地文件）
echo "2. 配置Git凭证助手(永久保存PAT)"
git config --global credential.helper store

# 3. 写入PAT到Git凭证文件（避免手动输入，保证安全）
echo "3. 写入PAT到凭证文件"
# 提取仓库的主机名和路径（从默认仓库URL中解析，也可手动指定）
REPO_HOST="github.com"
REPO_PATH=$(echo "$DEFAULT_REPO_URL" | sed -n 's/https:\/\/github.com\/\(.*\)/\1/p')
# 写入格式：https://用户名:PAT@主机名/仓库路径.git
CREDENTIAL_LINE="https://$GITHUB_USERNAME:$GITHUB_PAT@$REPO_HOST/$REPO_PATH"
# 写入凭证文件（覆盖旧文件，避免重复）
echo "$CREDENTIAL_LINE" > ~/.git-credentials
# 设置凭证文件权限（仅当前用户可读写，防止泄露）
chmod 600 ~/.git-credentials

# 4. 克隆仓库（如果目录不存在）
echo "4. 克隆仓库（若未克隆）"
REPO_DIR=$(basename "$DEFAULT_REPO_URL" .git) # 从仓库URL提取目录名（如QuoteOnline）
if [ ! -d "$REPO_DIR" ]; then
    git clone "$DEFAULT_REPO_URL"
else
    echo "  仓库目录 $REPO_DIR 已存在，跳过克隆"
fi

# ===================== 配置完成 =====================
echo "===== Git无密码连接GitHub配置完成 ====="
echo "测试命令：进入仓库目录执行 git pull / git push 验证是否生效"
echo "仓库目录：$(pwd)/$REPO_DIR"