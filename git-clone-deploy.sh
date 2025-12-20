#!/bin/bash
set -e

# ===================== 配置项 ======================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
ENV_NAME="production"
PROJECT_DIR="/var/www/QuoteOnline"
WORKFLOW_FILE="deploy-from-clone.yml"
SIGN_SECRET='Jicladie2&#fjoCK!('

# ===================== 交互式输入 ======================
read -p "请输入 GitHub PAT (必须有 repo + workflow 权限): " GITHUB_PAT
if [ -z "$GITHUB_PAT" ]; then
    echo -e "\033[31m【错误】GitHub PAT 不能为空！\033[0m"
    exit 1
fi

read -p "请输入你的域名 (例如 portal.ooishipping.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "\033[31m【错误】域名不能为空！\033[0m"
    exit 1
fi

# 自动获取服务器公网 IP
SERVER_IP=$(curl -s ifconfig.me)

# ===================== 工具函数 ======================
install_dependencies() {
    echo -e "\033[32m===== 安装必需依赖 =====\033[0m"
    sudo apt update -y
    DEPS=("git" "jq" "openssl" "docker.io" "docker-compose" "curl" "certbot" "python3-certbot-nginx")
    for dep in "${DEPS[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            echo "安装 $dep ..."
            sudo apt install -y "$dep"
        else
            echo "$dep 已存在"
        fi
    done
    sudo systemctl start docker
    sudo systemctl enable docker
}

create_generate_env_script() {
    echo -e "\033[32m===== 自动创建 generate-env.sh 脚本 =====\033[0m"
    mkdir -p "$PROJECT_DIR"
    
    cat > "$PROJECT_DIR/generate-env.sh" << EOF
#!/bin/bash
set -e
SIGN_SECRET="$SIGN_SECRET"
PROJECT_DIR="$PROJECT_DIR"
DOMAIN="$DOMAIN"

verify_signature() {
    local received_signature=\$(cat /tmp/signature.txt)
    local payload=\$(cat /tmp/secrets_payload.json)
    local calculated_signature=\$(echo -n "\$payload" | openssl dgst -sha256 -hmac "\$SIGN_SECRET" | awk '{print \$2}')
    [ "\$received_signature" = "\$calculated_signature" ]
}

if ! verify_signature; then
    echo -e "\033[31m【错误】敏感信息签名验证失败！\033[0m"
    rm -f /tmp/secrets_payload.json /tmp/signature.txt
    exit 1
fi

MONGODB_URI=\$(jq -r '.MONGODB_URI' /tmp/secrets_payload.json)
JWT_SECRET=\$(jq -r '.JWT_SECRET' /tmp/secrets_payload.json)
JWT_REFRESH_SECRET=\$(jq -r '.JWT_REFRESH_SECRET' /tmp/secrets_payload.json)
EMAIL_PASS=\$(jq -r '.EMAIL_PASS' /tmp/secrets_payload.json)
MAILGUN_API_KEY=\$(jq -r '.MAILGUN_API_KEY' /tmp/secrets_payload.json)

cd "\$PROJECT_DIR"
cat > .env << EOF_INNER
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://\$DOMAIN
EMAIL_HOST=smtp.exmail.qq.com
EMAIL_PORT=465
EMAIL_USER=sales@junbclistings.com
EMAIL_FROM=sales@junbclistings.com
ENABLE_QUOTE_EMAIL_NOTIFICATIONS=true
MAILGUN_DOMAIN=junbclistings.com
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

MONGODB_URI=\$MONGODB_URI
JWT_SECRET=\$JWT_SECRET
JWT_REFRESH_SECRET=\$JWT_REFRESH_SECRET
EMAIL_PASS=\$EMAIL_PASS
MAILGUN_API_KEY=\$MAILGUN_API_KEY
EOF_INNER

chmod 600 .env
rm -f /tmp/secrets_payload.json /tmp/signature.txt
echo -e "\033[32m===== .env 文件生成成功 =====\033[0m"
EOF

    chmod +x "$PROJECT_DIR/generate-env.sh"
    echo "generate-env.sh 脚本已创建并赋予执行权限：$PROJECT_DIR/generate-env.sh"
}

trigger_github_actions() {
    echo -e "\033[32m===== 触发 GitHub Actions 读取 Environment Secrets =====\033[0m"
    WORKFLOW_ID=$(curl -s \
        -H "Authorization: token $GITHUB_PAT" \
        https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows \
        | jq -r --arg file "$WORKFLOW_FILE" '.workflows[] | select(.path | endswith($file)) | .id')
    if [ -z "$WORKFLOW_ID" ]; then
        echo -e "\033[31m【错误】未找到 workflow：$WORKFLOW_FILE\033[0m"
        exit 1
    fi
    curl -s -X POST \
        -H "Authorization: token $GITHUB_PAT" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
        -d "$(jq -nc --arg ip "$SERVER_IP" '{ref:"main", inputs:{server_ip:$ip}}')"
    echo "GitHub Actions 已成功触发"
}

# ===================== 主流程 ======================
main() {
    install_dependencies
    create_generate_env_script

    echo -e "\033[32m===== 克隆/更新仓库 =====\033[0m"
    mkdir -p "$(dirname "$PROJECT_DIR")"
    if [ -d "$PROJECT_DIR/.git" ]; then
        cd "$PROJECT_DIR"
        git pull origin main
    else
        rm -rf "$PROJECT_DIR"
        git clone "https://github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR"
    fi

    trigger_github_actions

    echo "等待 .env 文件生成..."
    while [ ! -f "$PROJECT_DIR/.env" ]; do
        sleep 2
    done
    echo ".env 文件生成完成"

    echo -e "\033[32m===== 启动 Docker 服务 =====\033[0m"
    cd "$PROJECT_DIR"
    cp ./client/src/environments/environment.prod.ts ./client/environment.ts
    sudo docker-compose up -d --build

    echo -e "\033[32m===== 安装 SSL 证书 =====\033[0m"
    sudo docker-compose stop nginx
    sudo certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN \
        --non-interactive --agree-tos --register-unsafely-without-email

    echo -e "\033[32m===== 配置自动续期 =====\033[0m"
    (crontab -l 2>/dev/null; echo "0 0,12 * * * /usr/bin/certbot renew --quiet && /usr/bin/docker-compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

    sudo docker-compose start nginx

    echo -e "\033[32m===== 部署完成 =====\033[0m"
    echo "项目目录：$PROJECT_DIR"
    echo "域名：$DOMAIN"
    docker ps
}

main
