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
log() { echo -e "▶ $*"; }
ok()  { echo -e "✅ $*"; }
warn(){ echo -e "⚠️  $*" >&2; }
die() { echo -e "❌ $*" >&2; exit 1; }

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
    apt install -y git curl jq ca-certificates gnupg lsb-release openssl
    apt install -y certbot
  else
    $mgr install -y epel-release || true
    $mgr install -y git curl jq ca-certificates openssl

    # certbot（不同发行版包名不完全一致，尽量兼容）
    if ! command -v certbot >/dev/null 2>&1; then
      $mgr install -y certbot || true
      $mgr install -y python3-certbot-nginx || true
    fi
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

  # node + npm + ng（用于本机 build 前端，避免 dist 为空）
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

  # NOTE：私仓 clone 用 PAT 的 https URL
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

write_nginx_http_only() {
  local domain="$1"
  local domain_www="www.${domain}"

  log "生成 Nginx HTTP-only 配置（用于 certbot webroot 验证）..."

  mkdir -p "$CLIENT_DIR"
  mkdir -p "$DIST_DIR/.well-known/acme-challenge"
  chmod -R 755 "$DIST_DIR/.well-known" || true

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

  location /health {
    access_log off;
    return 200 "healthy\\n";
    add_header Content-Type text/plain;
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
}
EOF

  ok "HTTP-only nginx.conf 已写入：$NGINX_CONF"
}

build_frontend() {
  log "构建 Angular 前端（保证 dist 不为空）..."
  cd "$CLIENT_DIR"

  if [[ ! -f package.json ]]; then
    die "未找到 $CLIENT_DIR/package.json，无法构建前端"
  fi

  npm ci --legacy-peer-deps || npm install --legacy-peer-deps

  # 兼容不同脚本名：优先 build:optimized，其次 build，其次 ng build
  if npm run | grep -q "build:optimized"; then
    npm run build:optimized
  elif npm run | grep -q -E "^  build"; then
    npm run build
  else
    ng build --configuration production
  fi

  [[ -f "$DIST_DIR/index.html" ]] || die "前端构建失败：$DIST_DIR/index.html 不存在（dist 为空）"
  ok "前端构建完成：$DIST_DIR"
}

compose_up_http() {
  log "启动容器（HTTP 模式先跑起来，供 webroot 验证）..."
  cd "$PROJECT_DIR"
  docker compose down || true
  docker compose up -d --build
  ok "容器启动完成"
}

trigger_workflow() {
  local pat="$1"
  local domain="$2"
  log "触发 GitHub Actions（下发 .env）..."

  curl -fsSL -X POST \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${pat}" \
    "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches" \
    -d @- <<EOF >/dev/null
{
  "ref": "main",
  "inputs": {
    "domain": "${domain}"
  }
}
EOF

  ok "Workflow 已触发"
}

wait_for_env() {
  log "等待 GitHub Actions 下发 .env ..."
  local env_path="$PROJECT_DIR/.env"
  local i=0
  while [[ ! -s "$env_path" ]]; do
    i=$((i+1))
    if [[ $i -gt 120 ]]; then
      die "等待超时：$env_path 仍不存在或为空（检查 GitHub Actions 是否成功 scp 到服务器）"
    fi
    sleep 2
  done
  chmod 600 "$env_path" || true
  ok ".env 已就绪：$env_path"

  # 关键：.env 下发后必须重启容器，让 env 生效（避免你怀疑的“先启动容器后写.env”问题）
  log "重启容器以加载最新 .env ..."
  cd "$PROJECT_DIR"
  docker compose restart backend nginx || true
  ok "容器已重启加载 .env"
}

verify_acme_path_locally() {
  local domain="$1"
  local token="acme-$(date +%s)-$RANDOM"
  local fpath="$DIST_DIR/.well-known/acme-challenge/${token}"

  log "验证 ACME challenge 路径在本机可访问（http://127.0.0.1/.well-known/...）..."
  echo "ok-${token}" > "$fpath"
  chmod 644 "$fpath" || true

  # 通过本机 80 验证（确保 nginx 配置/挂载正确）
  local got
  got="$(curl -fsS "http://127.0.0.1/.well-known/acme-challenge/${token}" || true)"
  rm -f "$fpath" || true

  [[ "$got" == "ok-${token}" ]] || die "ACME 验证路径本机不可访问：请检查 nginx.conf 是否放行 /.well-known 以及 dist 是否正确挂载"
  ok "本机 ACME 路径验证通过"
}

obtain_cert_webroot_testcert() {
  local domain="$1"
  local domain_www="www.${domain}"

  log "申请 SSL 证书（webroot + --test-cert staging）..."

  mkdir -p "$DIST_DIR/.well-known/acme-challenge"
  chmod -R 755 "$DIST_DIR/.well-known" || true

  # DNS 检查（避免 NXDOMAIN）
  if ! getent ahosts "$domain" >/dev/null 2>&1; then
    die "DNS 未解析：$domain（请先把 A 记录指到本机公网 IP/Reserved IP，等待生效后再跑）"
  fi

  # 先做本机验证，确保 nginx 的 webroot 正确
  verify_acme_path_locally "$domain"

  certbot certonly --webroot \
    -w "$DIST_DIR" \
    -d "$domain" -d "$domain_www" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --test-cert

  [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]] || die "证书文件不存在，申请失败"
  ok "证书申请成功（staging test-cert）：/etc/letsencrypt/live/${domain}/"
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

read -s -p "请输入 GitHub PAT（需要 repo 权限，能触发 workflow 更好）: " GITHUB_PAT
echo ""
[[ -n "${GITHUB_PAT}" ]] || die "GitHub PAT 不能为空"

PKG_MGR="$(detect_pkg_mgr)"
install_deps "$PKG_MGR"
free_ports
clone_repo "$GITHUB_PAT"

# 先写 HTTP-only nginx.conf，避免 nginx 因 443 证书缺失而崩
write_nginx_http_only "$DOMAIN"

# 构建前端，保证 dist 存在
build_frontend

# 起容器（HTTP 模式）
compose_up_http

# 触发 workflow 下发 .env，并等待 + 重启容器加载 env
trigger_workflow "$GITHUB_PAT" "$DOMAIN"
wait_for_env

# 申请证书（webroot + staging test cert）
obtain_cert_webroot_testcert "$DOMAIN"

# 切换 HTTPS nginx.conf 并重启 nginx
write_nginx_https_from_template "$DOMAIN"
restart_nginx_container

# 自动续期
setup_renew_cron

echo ""
echo "=========================================="
ok "部署完成"
echo "访问：https://${DOMAIN}"
echo "项目目录：${PROJECT_DIR}"
echo "检查：docker compose -f ${PROJECT_DIR}/docker-compose.yml ps"
echo "日志：docker compose -f ${PROJECT_DIR}/docker-compose.yml logs -f nginx"
echo "=========================================="
