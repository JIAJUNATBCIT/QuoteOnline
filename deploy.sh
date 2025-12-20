#!/bin/bash
set -e

# ===================== 基础配置 ======================
GITHUB_USERNAME="JIAJUNATBCIT"
GITHUB_REPO="QuoteOnline"
ENV_NAME="production"
PROJECT_DIR="/var/www/QuoteOnline"
WORKFLOW_FILE="deploy-from-clone.yml"
SIGN_SECRET='Husar2pawiaO284872'

# ===================== 交互式输入 ======================
read -s -p "请输入 GitHub PAT (必须有 repo + workflow 权限): " GITHUB_PAT
echo
if [ -z "$GITHUB_PAT" ]; then
    echo -e "\033[31m【错误】GitHub PAT 不能为空！\033[0m"
    exit 1
fi

read -p "请输入你的域名 (例如 portal.ooishipping.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "\033[31m【错误】域名不能为空！\033[0m"
    exit 1
fi

# 域名合法性校验
if ! [[ "$DOMAIN" =~ ^[a-zA-Z0-9.-]+$ ]]; then
    echo -e "\033[31m【错误】域名格式不合法：$DOMAIN\033[0m"
    exit 1
fi

SERVER_IP=$(curl -s ifconfig.me)

# ===================== 安装依赖 ======================
install_dependencies() {
    echo -e "\033[32m===== 安装系统依赖 =====\033[0m"
    sudo apt update -y

    DEPS=("git" "jq" "openssl" "curl" "docker.io" "certbot" "python3-certbot-nginx")
    for dep in "${DEPS[@]}"; do
        if ! command -v "$dep" &>/dev/null; then
            sudo apt install -y "$dep"
        fi
    done

    sudo systemctl start docker
    sudo systemctl enable docker

    # Docker Compose v2
    if ! docker compose version &>/dev/null; then
        echo "安装 Docker Compose v2 ..."
        sudo mkdir -p /usr/local/lib/docker/cli-plugins
        sudo curl -SL \
            https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64 \
            -o /usr/local/lib/docker/cli-plugins/docker-compose
        sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    fi
}

# ===================== 生成 generate-env.sh ======================
create_generate_env_script() {
    mkdir -p "$PROJECT_DIR"

    cat > "$PROJECT_DIR/generate-env.sh" << EOF
#!/bin/bash
set -e
SIGN_SECRET="$SIGN_SECRET"
PROJECT_DIR="$PROJECT_DIR"
DOMAIN="$DOMAIN"

verify_signature() {
    local sig=\$(cat /tmp/signature.txt)
    local payload=\$(cat /tmp/secrets_payload.json)
    local calc=\$(echo -n "\$payload" | openssl dgst -sha256 -hmac "\$SIGN_SECRET" | awk '{print \$2}')
    [ "\$sig" = "\$calc" ]
}

verify_signature || exit 1

MONGODB_URI=\$(jq -r '.MONGODB_URI' /tmp/secrets_payload.json)
JWT_SECRET=\$(jq -r '.JWT_SECRET' /tmp/secrets_payload.json)
JWT_REFRESH_SECRET=\$(jq -r '.JWT_REFRESH_SECRET' /tmp/secrets_payload.json)
EMAIL_PASS=\$(jq -r '.EMAIL_PASS' /tmp/secrets_payload.json)
MAILGUN_API_KEY=\$(jq -r '.MAILGUN_API_KEY' /tmp/secrets_payload.json)

cd "\$PROJECT_DIR"
cat > .env << EOF_ENV
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://\$DOMAIN
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

MONGODB_URI=\$MONGODB_URI
JWT_SECRET=\$JWT_SECRET
JWT_REFRESH_SECRET=\$JWT_REFRESH_SECRET
EMAIL_PASS=\$EMAIL_PASS
MAILGUN_API_KEY=\$MAILGUN_API_KEY
EOF_ENV

chmod 600 .env
rm -f /tmp/secrets_payload.json /tmp/signature.txt
EOF

    chmod +x "$PROJECT_DIR/generate-env.sh"
}

# ===================== 触发 GitHub Actions ======================
trigger_github_actions() {
    WORKFLOW_ID=$(curl -s \
        -H "Authorization: token $GITHUB_PAT" \
        https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows \
        | jq -r --arg file "$WORKFLOW_FILE" '.workflows[] | select(.path | endswith($file)) | .id')

    [ -z "$WORKFLOW_ID" ] && exit 1

    curl -s -X POST \
        -H "Authorization: token $GITHUB_PAT" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/$GITHUB_USERNAME/$GITHUB_REPO/actions/workflows/$WORKFLOW_ID/dispatches" \
        -d "$(jq -nc --arg ip "$SERVER_IP" '{ref:"main", inputs:{server_ip:$ip}}')"
}

# ===================== 主流程 ======================
main() {
    install_dependencies
    create_generate_env_script

    mkdir -p "$(dirname "$PROJECT_DIR")"
    if [ -d "$PROJECT_DIR/.git" ]; then
        cd "$PROJECT_DIR" && git pull origin main
    else
        rm -rf "$PROJECT_DIR"
        git clone "https://github.com/$GITHUB_USERNAME/$GITHUB_REPO.git" "$PROJECT_DIR"
    fi

    trigger_github_actions

    while [ ! -f "$PROJECT_DIR/.env" ]; do sleep 2; done

    TEMPLATE="$PROJECT_DIR/client/nginx.conf.template"
    [ ! -f "$TEMPLATE" ] && exit 1
    sed "s/{{DOMAIN}}/$DOMAIN/g" "$TEMPLATE" > "$PROJECT_DIR/client/nginx.conf"

    cd "$PROJECT_DIR"
    docker compose up -d --build

    docker compose stop nginx

    if ! sudo certbot certonly --standalone \
        -d "$DOMAIN" -d "www.$DOMAIN" \
        --non-interactive --agree-tos --register-unsafely-without-email; then
        echo "SSL 申请失败"
        exit 1
    fi

    (crontab -l 2>/dev/null; \
     echo "0 0,12 * * * certbot renew --quiet && docker compose -f $PROJECT_DIR/docker-compose.yml restart nginx") | crontab -

    docker compose start nginx
    docker ps
}

main
