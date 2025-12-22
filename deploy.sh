#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "  QuoteOnline One-Click Deploy (Stable)"
echo "  Bridge network + webroot TLS + GH env"
echo "  (keeps --test-cert)"
echo "=========================================="
echo ""

PROJECT_DIR="/var/www/QuoteOnline"
REPO_OWNER="JIAJUNATBCIT"
REPO_NAME="QuoteOnline"
WORKFLOW_FILE="deploy-from-clone.yml"

CLIENT_DIR="$PROJECT_DIR/client"
DIST_DIR="$CLIENT_DIR/dist/quote-online-client"
NGINX_TEMPLATE="$CLIENT_DIR/nginx.conf.template"
NGINX_CONF="$CLIENT_DIR/nginx.conf"

# -----------------------------
# helpers
# -----------------------------
log()  { echo -e "▶ $*"; }
ok()   { echo -e "✅ $*"; }
warn() { echo -e "⚠️  $*" >&2; }
die()  { echo -e "❌ $*" >&2; exit 1; }

need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    die "请用 root 运行（或 sudo -i 后再执行）。"
  fi
}

detect_pkg_mgr() {
  if command -v apt >/dev/null 2>&1; then echo "apt"; return; fi
  if command -v dnf >/dev/null 2>&1; then echo "dnf"; return; fi
  if command -v yum >/dev/null 2>&1; then echo "yum"; return; fi
  die "不支持的系统：未找到 apt/dnf/yum"
}

install_deps() {
  local mgr="$1"
  log "安装系统依赖（$mgr）..."

  if [[ "$mgr" == "apt" ]]; then
    apt update -y
    apt install -y git curl jq ca-certificates gnupg lsb-release openssl certbot
  else
    # CentOS/RHEL/Rocky/Alma
    $mgr install -y epel-release || true
    $mgr install -y git curl jq ca-certificates openssl || true
    # certbot on EL9 sometimes requires python3-certbot-nginx or snap; try best effort
    $mgr install -y certbot || $mgr install -y certbot python3-certbot-nginx || true
  fi

  # Docker
  if ! command -v docker >/dev/null 2>&1; then
    log "安装 Docker..."
    curl -fsSL https://get.docker.com | sh
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true

  # docker compose plugin
  if ! docker compose version >/dev/null 2>&1; then
    log "安装 docker compose plugin..."
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL "https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi

  # Node + Angular CLI（为了本机 build 前端，避免 dist 为空导致 403）
  if ! command -v node >/dev/null 2>&1; then
    log "安装 Node.js 20..."
    if [[ "$mgr" == "apt" ]]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt install -y nodejs
    else
      curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
      $mgr install -y nodejs
    fi
  fi

  if ! command -v ng >/dev/null 2>&1; then
    log "安装 Angular CLI..."
    npm install -g @angular/cli
  fi

  ok "依赖安装完成"
}

free_ports() {
  log "释放 80/443 端口占用..."
  systemctl stop nginx >/dev/null 2>&1 || true
  systemctl stop apache2 >/dev/null 2>&1 || true
  systemctl stop httpd >/dev/null 2>&1 || true

  # 停掉占用 80/443 的 docker 容器
  docker ps -q --filter "publish=80"  | xargs -r docker stop || true
  docker ps -q --filter "publish=443" | xargs -r docker stop || true

  ok "端口处理完成"
}

clone_repo() {
  local pat="$1"
  log "同步项目代码到 $PROJECT_DIR ..."

  mkdir -p /var/www
  cd /var/www

  local repo_url="https://${pat}@github.com/${REPO_OWNER}/${REPO_NAME}.git"

  if [[ ! -d "$PROJECT_DIR/.git" ]]; then
    rm -rf "$PROJECT_DIR"
    git clone "$repo_url" "$PROJECT_DIR"
  else
    cd "$PROJECT_DIR"
    git fetch origin
    git reset --hard origin/main
  fi

  ok "代码同步完成"
}

ensure_dirs() {
  mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads" || true
  chmod -R 755 "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads" || true
}

ensure_stub_env() {
  # 关键：让 docker compose 永远不会因 env_file 缺失而失败
  local env_path="$PROJECT_DIR/.env"
  if [[ -f "$env_path" ]]; then
    return
  fi

  log "创建占位 .env（等待 GitHub Actions 覆盖）..."
  cat > "$env_path" <<EOF
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://${DOMAIN}
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# placeholders (will be overwritten by GitHub Actions)
MONGODB_URI=placeholder
JWT_SECRET=placeholder
JWT_REFRESH_SECRET=placeholder
EMAIL_PASS=placeholder
MAILGUN_API_KEY=placeholder

EMAIL_FROM=placeholder
EMAIL_HOST=placeholder
EMAIL_PORT=465
ENABLE_QUOTE_EMAIL_NOTIFICATIONS=true
MAILGUN_DOMAIN=placeholder
EOF
  chmod 600 "$env_path" || true
  ok "占位 .env 已创建：$env_path"
}

build_frontend() {
  log "构建 Angular 前端（保证 dist 不为空）..."
  cd "$CLIENT_DIR"

  [[ -f package.json ]] || die "未找到 $CLIENT_DIR/package.json，无法构建前端"

  # 禁止任何交互提示（Angular CLI 的 autocompletion 问题）
  export CI=1
  export NG_CLI_ANALYTICS=false
  export APT_LISTCHANGES_FRONTEND=none
  export DEBIAN_FRONTEND=noninteractive

  # 安装依赖：优先 ci（更稳定），失败再 fallback install
  npm ci --legacy-peer-deps --no-audit --no-fund || npm install --legacy-peer-deps --no-audit --no-fund

  # 直接跑 build:optimized（你项目里有这个脚本），并明确 --no-interactive
  # 如果未来你删了 build:optimized，也会自动 fallback 到 ng build production
  if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts['build:optimized']?0:1)"; then
    npm run -s build:optimized -- --no-interactive
  else
    ng build --configuration production --no-interactive
  fi

  [[ -f "$DIST_DIR/index.html" ]] || die "前端构建失败：$DIST_DIR/index.html 不存在（dist 为空）"
  ok "前端构建完成：$DIST_DIR"
  cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts"
}

write_nginx_http_only() {
  local domain="$1"
  local domain_www="www.${domain}"

  log "生成 Nginx HTTP-only 配置（用于 certbot webroot 验证）..."

  mkdir -p "$DIST_DIR/.well-known/acme-challenge"
  chmod -R 755 "$DIST_DIR/.well-known" || true

  # 关键修复：EOF 顶格书写，无缩进
  cat > "$NGINX_CONF" <<EOF
server {
  listen 80;
  server_name ${domain} ${domain_www};

  root /usr/share/nginx/html;
  index index.html;

  location /.well-known/acme-challenge/ {
    root /usr/share/nginx/html;
    try_files \$uri =404;
  }

  location /api/ {
    proxy_pass http://backend:3000/api/;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    try_files \$uri \$uri/ /index.html;
  }

  location /health {
    access_log off;
    return 200 "healthy\\n";
    add_header Content-Type text/plain;
  }
}
EOF

  ok "HTTP-only nginx.conf 已写入：$NGINX_CONF"
}

compose_up_http() {
  log "启动容器（HTTP 模式先跑起来，供 webroot 验证）..."
  cd "$PROJECT_DIR"
  docker compose down || true
  docker compose up -d --build
  ok "容器启动完成"
}

dns_check() {
  local domain="$1"
  log "检查 DNS 解析（避免 NXDOMAIN）..."
  if ! getent ahosts "$domain" >/dev/null 2>&1; then
    die "DNS 未解析：$domain（请先把 A 记录指到本机公网/Reserved IP，等待生效后再跑）"
  fi
  ok "DNS 解析正常"
}

obtain_cert_webroot_test() {
  local domain="$1"
  local domain_www="www.${domain}"

  log "申请 SSL 证书（webroot + --test-cert）..."

  mkdir -p "$DIST_DIR/.well-known/acme-challenge"
  chmod -R 755 "$DIST_DIR/.well-known" || true

  certbot certonly --webroot \
    -w "$DIST_DIR" \
    -d "$domain" -d "$domain_www" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --test-cert

  [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]] || die "证书文件不存在，申请失败"
  ok "测试证书申请成功：/etc/letsencrypt/live/${domain}/"
}

write_nginx_https_from_template() {
  local domain="$1"
  log "生成 HTTPS nginx.conf（基于模板替换 {{DOMAIN}}）..."

  [[ -f "$NGINX_TEMPLATE" ]] || die "找不到模板：$NGINX_TEMPLATE"

  sed "s/{{DOMAIN}}/${domain}/g" "$NGINX_TEMPLATE" > "$NGINX_CONF"
  ok "HTTPS nginx.conf 已生成：$NGINX_CONF"
}

restart_nginx_container() {
  log "重启 nginx 容器..."
  cd "$PROJECT_DIR"
  docker compose restart nginx
  ok "nginx 已重启"
}

setup_renew_cron() {
  log "配置证书自动续期（cron：每天 03:00 renew + 重启 nginx）..."
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && cd $PROJECT_DIR && docker compose restart nginx >/dev/null 2>&1") | crontab -
  ok "自动续期已设置"
}

trigger_workflow() {
  local pat="$1"
  local domain="$2"

  log "触发 GitHub Actions（下发 .env）..."
  # 关键修复：EOF 顶格书写，无缩进
  curl -fsSL -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${pat}" \
    "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches" \
    -d @- >/dev/null <<EOF
{
  "ref": "main",
  "inputs": { "domain": "${domain}" }
}
EOF
  ok "Workflow 已触发"
}

wait_for_env_nonplaceholder() {
  # 等待 workflow 覆盖（非空且 MONGODB_URI 不再是 placeholder）
  log "等待 GitHub Actions 下发真实 .env ..."
  local env_path="$PROJECT_DIR/.env"
  local i=0
  while true; do
    i=$((i+1))
    if [[ -s "$env_path" ]] && grep -q '^MONGODB_URI=' "$env_path" && ! grep -q '^MONGODB_URI=placeholder' "$env_path"; then
      chmod 600 "$env_path" || true
      ok "真实 .env 已就绪：$env_path"
      return
    fi
    if [[ $i -gt 150 ]]; then
      die "等待超时：workflow 可能未成功 scp .env 到服务器（请去 GitHub Actions 看日志）"
    fi
    sleep 2
  done
}

compose_restart_all() {
  log "确保容器加载新 .env（up + restart）..."
  cd "$PROJECT_DIR"
  docker compose up -d
  docker compose restart backend nginx || docker compose restart
  ok "服务已重启并加载新配置"
}

# -----------------------------
# main
# -----------------------------
need_root

log "读取部署参数"
read -p "请输入域名（例如 portal.ooishipping.com）: " DOMAIN
[[ -n "${DOMAIN}" ]] || die "DOMAIN 不能为空"
if [[ ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]]; then
  die "域名格式不合法：$DOMAIN"
fi

read -s -p "请输入 GitHub PAT（需要 repo 权限，建议也有 workflow 权限）: " GITHUB_PAT
echo ""
[[ -n "${GITHUB_PAT}" ]] || die "GitHub PAT 不能为空"

PKG_MGR="$(detect_pkg_mgr)"
install_deps "$PKG_MGR"
free_ports
clone_repo "$GITHUB_PAT"
ensure_dirs

# 1) build dist（否则 nginx 403/默认页）
build_frontend

# 2) 先写 HTTP-only nginx.conf，避免 HTTPS 证书缺失导致 nginx 崩
write_nginx_http_only "$DOMAIN"

# 3) 关键：先生成占位 .env，避免 compose 因 env_file 缺失直接失败
ensure_stub_env

# 4) 启动容器（HTTP 模式），让 webroot 验证可以被公网访问
compose_up_http

# 5) DNS 检查（避免 NXDOMAIN）
dns_check "$DOMAIN"

# 6) 申请测试证书（--test-cert）
obtain_cert_webroot_test "$DOMAIN"

# 7) 切换 HTTPS nginx.conf，并重启 nginx
write_nginx_https_from_template "$DOMAIN"
restart_nginx_container

# 8) 触发 workflow 下发真实 .env，等待覆盖，然后 up + restart 让容器加载真实 env
trigger_workflow "$GITHUB_PAT" "$DOMAIN"
wait_for_env_nonplaceholder
compose_restart_all

# 9) 自动续期
setup_renew_cron

echo ""
echo "=========================================="
ok "部署完成"
echo "访问：https://${DOMAIN}"
echo "项目目录：${PROJECT_DIR}"
echo "检查：docker compose -f ${PROJECT_DIR}/docker-compose.yml ps"
echo "=========================================="