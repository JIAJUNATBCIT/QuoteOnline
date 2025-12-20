#!/bin/bash
set -e

# ===================== 用户输入 =====================
read -p "请输入 GitHub PAT: " GITHUB_PAT
read -p "请输入部署域名 (例如 portal.ooishipping.com): " DOMAIN

# ===================== 配置项 =====================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
ENV_NAME="production"
PROJECT_DIR="/var/www/QuoteOnline"
SERVER_IP=$(curl -s ifconfig.me)
WORKFLOW_FILE="deploy-from-clone.yml"
SIGN_SECRET="Jicladie2&#fjoCK!("

# ===================== 创建 generate-env.sh =====================
create_generate_env_script() {
    echo -e "\033[32m===== 自动创建 generate-env.sh 脚本 =====\033[0m"
    mkdir -p "$PROJECT_DIR"

    cat > "$PROJECT_DIR/generate-env.sh" << EOF
#!/bin/bash
set -e
SIGN_SECRET="$SIGN_SECRET"
PROJECT_DIR="$PROJECT_DIR"

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
FRONTEND_URL=https://$DOMAIN
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
    echo -e "generate-env.sh 已创建：$PROJECT_DIR/generate-env.sh"
}

# ===================== 更新 nginx.conf =====================
update_nginx_conf() {
    echo -e "\033[32m===== 替换 nginx.conf 域名 =====\033[0m"
    sed "s|\${DOMAIN}|$DOMAIN|g" "$PROJECT_DIR/client/nginx.conf.template" > "$PROJECT_DIR/client/nginx.conf"
}

# ===================== 安装依赖 =====================
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

# ===================== GitHub Actions =====================
trigger_github_actions() {
    echo -e "\033[32m===== 触发 GitHub Actions 获取 Secrets =====\033[0m"
    WORKFLOW_ID=$(curl -s \
        -H "Authorization: token $GITHUB_PAT" \
        https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows \
        | jq -r --arg file "$WORKFLOW_FILE" '.workflows[] | select(.path | endswith($file)) | .id'
    )

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

# ===================== 主流程 =====================
main() {
    install_dependencies
    create_generate_env_script

    # 克隆或更新代码
    echo -e "\033[32m===== 克隆/更新代码仓库 =====\033[0m"
    mkdir -p "$(dirname "$PROJECT_DIR")"
    if [ -d "$PROJECT_DIR/.git" ]; then
        cd "$PROJECT_DIR" && git pull origin main
    else
        rm -rf "$PROJECT_DIR"
        git clone "https://github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR"
    fi

    # 触发 GitHub Actions 获取 .env
    trigger_github_actions
    echo "等待 .env 文件生成..."
    while [ ! -f "$PROJECT_DIR/.env" ]; do sleep 2; done
    echo ".env 文件生成完成"

    # 替换 nginx.conf 中的域名
    update_nginx_conf

    # 启动服务
    echo -e "\033[32m===== 启动 Docker 服务 =====\033[0m"
    cd "$PROJECT_DIR"
    cp ./client/src/environments/environment.prod.ts ./client/environment.ts
    sudo docker-compose up -d --build

    # 安装 SSL 证书
    echo -e "\033[32m===== 安装 SSL 证书 =====\033[0m"
    sudo docker-compose stop nginx
    sudo certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --register-unsafely-without-email

    # 设置自动续期
    (crontab -l 2>/dev/null; echo "0 0,12 * * * /usr/bin/certbot renew --quiet && /usr/bin/docker-compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

    # 重启 nginx
    sudo docker-compose start nginx

    echo -e "\033[32m===== 全量部署完成！=====\033[0m"
    echo "项目目录：$PROJECT_DIR"
    echo "可通过 docker ps 查看容器状态"
}

main
