#!/bin/bash
set -e

# ===================== 配置项（一次性配置）=====================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
GITHUB_PAT="$1"  # 第一个参数为 GitHub PAT（需拥有 repo 和 actions 权限）
ENV_NAME="production"
PROJECT_DIR="/var/www/QuoteOnline"
SERVER_IP=$(curl -s ifconfig.me)  # 自动获取服务器公网 IP（也可手动指定）
WORKFLOW_FILE="deploy-from-clone.yml"  # Actions 工作流文件名
SIGN_SECRET="Jicladie2&#fjoCK!("  # 和 GitHub Secrets 中的一致

# ===================== 工具函数：自动创建 generate-env.sh 脚本 =====================
create_generate_env_script() {
    echo -e "\033[32m===== 自动创建 generate-env.sh 脚本 =====\033[0m"
    
    # 确保项目目录存在
    mkdir -p "$PROJECT_DIR"
    
    # 生成 generate-env.sh 内容（直接写入文件）
    cat > "$PROJECT_DIR/generate-env.sh" << EOF
#!/bin/bash
set -e

# 配置项（和 GitHub Secrets 中的 SIGN_SECRET 一致）
SIGN_SECRET="$SIGN_SECRET"
PROJECT_DIR="$PROJECT_DIR"

# 工具函数：验证签名
verify_signature() {
    local received_signature=\$(cat /tmp/signature.txt)
    local payload=\$(cat /tmp/secrets_payload.json)
    local calculated_signature=\$(echo -n "\$payload" | openssl dgst -sha256 -hmac "\$SIGN_SECRET" | awk '{print \$2}')
    [ "\$received_signature" = "\$calculated_signature" ]
}

# 1. 验证签名
if ! verify_signature; then
    echo -e "\033[31m【错误】敏感信息签名验证失败！\033[0m"
    rm -f /tmp/secrets_payload.json /tmp/signature.txt
    exit 1
fi

# 2. 解析敏感信息
MONGODB_URI=\$(jq -r '.MONGODB_URI' /tmp/secrets_payload.json)
JWT_SECRET=\$(jq -r '.JWT_SECRET' /tmp/secrets_payload.json)
JWT_REFRESH_SECRET=\$(jq -r '.JWT_REFRESH_SECRET' /tmp/secrets_payload.json)
EMAIL_PASS=\$(jq -r '.EMAIL_PASS' /tmp/secrets_payload.json)
MAILGUN_API_KEY=\$(jq -r '.MAILGUN_API_KEY' /tmp/secrets_payload.json)

# 3. 生成 .env 文件
cd "\$PROJECT_DIR"
cat > .env << EOF_INNER
# 公共配置
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://portal.ooishipping.com
EMAIL_HOST=smtp.exmail.qq.com
EMAIL_PORT=465
EMAIL_USER=sales@junbclistings.com
EMAIL_FROM=sales@junbclistings.com
ENABLE_QUOTE_EMAIL_NOTIFICATIONS=true
MAILGUN_DOMAIN=junbclistings.com
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# 敏感配置（从 GitHub Environment Secrets 获取）
MONGODB_URI=\$MONGODB_URI
JWT_SECRET=\$JWT_SECRET
JWT_REFRESH_SECRET=\$JWT_REFRESH_SECRET
EMAIL_PASS=\$EMAIL_PASS
MAILGUN_API_KEY=\$MAILGUN_API_KEY
EOF_INNER

# 4. 设置 .env 权限
chmod 600 .env

# 5. 清理临时文件
rm -f /tmp/secrets_payload.json /tmp/signature.txt

echo -e "\033[32m===== .env 文件生成成功 =====\033[0m"
EOF

    # 赋予执行权限
    chmod +x "$PROJECT_DIR/generate-env.sh"
    
    echo -e "generate-env.sh 脚本已创建并赋予执行权限：$PROJECT_DIR/generate-env.sh"
}

# ===================== 工具函数：调用 GitHub API 触发 Actions =====================
trigger_github_actions() {
    echo -e "\033[32m===== 触发 GitHub Actions 读取 Environment Secrets =====\033[0m"
    
    # 获取 Workflow ID（通过文件名查询）
    WORKFLOW_ID=\$(curl -s -H "Authorization: token $GITHUB_PAT" \
        "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows" \
        | jq -r --arg file "$WORKFLOW_FILE" '.workflows[] | select(.path | endswith(\$file)) | .id')
    
    # 调用 workflow_dispatch API 触发工作流
    RESPONSE=\$(curl -s -X POST \
        -H "Authorization: token $GITHUB_PAT" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/\$WORKFLOW_ID/dispatches" \
        -d "{\"ref\":\"main\", \"inputs\": {\"server_ip\": \"$SERVER_IP\"}}")
    
    # 检查触发是否成功
    if [ -z "\$RESPONSE" ]; then
        echo -e "GitHub Actions 触发成功，等待敏感信息传递..."
    else
        echo -e "\033[31m【错误】触发 GitHub Actions 失败：\$RESPONSE\033[0m"
        exit 1
    fi

    # 等待 Actions 完成（可选，轮询检查工作流状态）
    sleep 10  # 等待 10 秒，让 Actions 完成敏感信息传递
}

# ===================== 工具函数：安装依赖 =====================
install_dependencies() {
    echo -e "\033[32m===== 安装必需依赖 =====\033[0m"
    sudo apt update -y > /dev/null 2>&1
    DEPS=("git" "jq" "openssl" "docker.io" "docker-compose" "curl")
    for dep in "\${DEPS[@]}"; do
        command -v "\$dep" &> /dev/null || sudo apt install -y "\$dep" > /dev/null 2>&1
    done
    sudo systemctl start docker > /dev/null 2>&1
    sudo systemctl enable docker > /dev/null 2>&1
}

# ===================== 主流程 =====================
main() {
    # 1. 校验 PAT 参数
    if [ -z "$GITHUB_PAT" ]; then
        echo -e "\033[31m【错误】请传入 GitHub PAT 作为参数！\033[0m"
        echo -e "使用方法：./git-clone-deploy.sh <你的 PAT>"
        exit 1
    fi

    # 2. 安装依赖
    install_dependencies

    # 3. 自动创建 generate-env.sh 脚本（核心：无需手动创建）
    create_generate_env_script

    # 4. 执行 git clone / pull
    echo -e "\033[32m===== 克隆/更新代码仓库 =====\033[0m"
    mkdir -p \$(dirname "$PROJECT_DIR")
    if [ -d "$PROJECT_DIR" ]; then
        cd "$PROJECT_DIR" && git pull origin main
    else
        git clone "https://github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR"
    fi

    # 5. 触发 GitHub Actions 获取 Environment Secrets
    trigger_github_actions

    # 6. 启动/重启服务
    echo -e "\033[32m===== 启动服务 =====\033[0m"
    cd "$PROJECT_DIR"
    cp ./client/src/environments/environment.prod.ts ./client/environment.ts
    sleep 2
    if [ -f "docker-compose.yml" ]; then
        sudo docker-compose up -d --build > /dev/null 2>&1
        echo -e "Docker 容器启动成功！"
    fi

    # 7. 部署完成
    echo -e "\033[32m===== 全量部署完成！=====\033[0m"
    echo -e "项目目录：$PROJECT_DIR"
    echo -e "可通过 docker ps 查看容器状态，或 cat $PROJECT_DIR/.env 查看敏感信息"
}

# 执行主流程
main "$@"