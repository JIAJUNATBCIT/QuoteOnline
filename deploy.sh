#!/usr/bin/env bash
set -euo pipefail

# 启用终端颜色支持
export TERM=xterm-256color

echo "=========================================="
echo "  QuoteOnline One-Click Deploy (Stable)"
echo "  Bridge network + webroot TLS + GH env"
echo "  (keeps --test-cert)"
echo "=========================================="
echo ""

# -----------------------------
# 配置常量（集中管理，方便修改）
# -----------------------------
PROJECT_DIR="/var/www/QuoteOnline"
REPO_OWNER="JIAJUNATBCIT"
REPO_NAME="QuoteOnline"
WORKFLOW_FILE="deploy-from-clone.yml"
CLIENT_DIR="$PROJECT_DIR/client"
DIST_DIR="$CLIENT_DIR/dist/quote-online-client"
NGINX_TEMPLATE="$CLIENT_DIR/nginx.conf.template"
NGINX_CONF="$CLIENT_DIR/nginx.conf"
# 超时配置
WAIT_ENV_TIMEOUT=120  # 等待.env的超时时间（秒），从300秒缩短到120秒
DOCKER_BUILD_PARALLEL=2  # Docker构建并行数（根据CPU核心数调整）

# -----------------------------
# 工具函数（优化日志+错误处理）
# -----------------------------
log()  { echo -e "\033[34m▶ $*\033[0m"; }
ok()   { echo -e "\033[32m✅ $*\033[0m"; }
warn() { echo -e "\033[33m⚠️  $*\033[0m" >&2; }
die()  { echo -e "\033[31m❌ $*\033[0m" >&2; exit 1; }

# 检查root权限
need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    die "请用 root 运行（或 sudo -i 后再执行）。"
  fi
}

# 检测包管理器（优化返回逻辑）
detect_pkg_mgr() {
  local mgr
  for mgr in apt dnf yum; do
    if command -v "$mgr" >/dev/null 2>&1; then
      echo "$mgr"
      return
    fi
  done
  die "不支持的系统：未找到 apt/dnf/yum"
}

# 安装依赖（优化速度：跳过不必要的更新+并行安装）
install_deps() {
  local mgr="$1"
  log "安装系统依赖（$mgr）..."

  # 优化：仅在首次安装时更新源，避免重复更新
  local update_flag="/tmp/.pkg_update_done"
  if [[ ! -f "$update_flag" ]]; then
    if [[ "$mgr" == "apt" ]]; then
      apt update -y >/dev/null 2>&1
    else
      $mgr install -y epel-release >/dev/null 2>&1 || true
      $mgr update -y >/dev/null 2>&1 || true
    fi
    touch "$update_flag"
  fi

  # 批量安装依赖（减少命令调用次数）
  if [[ "$mgr" == "apt" ]]; then
    apt install -y -qq git curl jq ca-certificates gnupg lsb-release openssl certbot >/dev/null 2>&1
  else
    $mgr install -y -q git curl jq ca-certificates openssl certbot python3-certbot-nginx >/dev/null 2>&1 || true
  fi

  # Docker安装（优化：使用国内镜像加速，可选）
  install_docker() {
    if command -v docker >/dev/null 2>&1; then
      log "Docker 已安装，跳过"
      systemctl enable --now docker >/dev/null 2>&1 || true
      return
    fi

    log "安装 Docker（加速版）..."
    # 国内镜像加速（注释掉可恢复默认）
    # curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun
    curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
    systemctl enable --now docker >/dev/null 2>&1 || true
  }

  # Docker Compose安装（优化：使用更快的下载源）
  install_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
      log "Docker Compose 已安装，跳过"
      return
    fi

    log "安装 Docker Compose..."
    mkdir -p /usr/local/lib/docker/cli-plugins
    # 国内镜像加速（注释掉可恢复默认）
    # curl -SL "https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64" \
    curl -SL "https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose >/dev/null 2>&1
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  }

  # Node.js安装（优化：使用nvm快速安装，避免系统包管理器的版本问题）
  install_node() {
    # 先检查是否已安装Node.js 20
    if command -v node >/dev/null 2>&1; then
      local node_version
      node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
      if [[ "$node_version" == "20" ]]; then
        log "Node.js 20 已安装，跳过"
        return
      fi
    fi

    log "安装 Node.js 20（nvm 加速版）..."
    # 安装nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash >/dev/null 2>&1
    # 加载nvm（兼容不同Shell）
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
    # 安装Node.js 20
    nvm install 20 >/dev/null 2>&1
    nvm alias default 20 >/dev/null 2>&1
    # 确保全局可用
    ln -s "$NVM_DIR/versions/node/v20*/bin/node" /usr/local/bin/node || true
    ln -s "$NVM_DIR/versions/node/v20*/bin/npm" /usr/local/bin/npm || true
  }

  # 执行安装
  install_docker
  install_docker_compose
  install_node

  # Angular CLI安装（优化：使用国内npm镜像）
  if ! command -v ng >/dev/null 2>&1; then
    log "安装 Angular CLI（国内镜像）..."
    npm install -g @angular/cli --registry=https://registry.npmmirror.com >/dev/null 2>&1
  else
    log "Angular CLI 已安装，跳过"
  fi

  ok "依赖安装完成"
}

# 释放端口（优化：仅检查并停止占用端口的进程，不盲目停止服务）
free_ports() {
  log "释放 80/443 端口占用..."
  # 查找并停止占用80/443的进程（兼容lsof未安装的情况）
  if command -v lsof >/dev/null 2>&1; then
    for port in 80 443; do
      local pid
      pid=$(lsof -t -i:"$port" -sTCP:LISTEN)
      if [[ -n "$pid" ]]; then
        kill -9 "$pid" >/dev/null 2>&1 || true
      fi
    done
  fi

  # 停掉占用80/443的docker容器
  docker ps -q --filter "publish=80"  | xargs -r docker stop >/dev/null 2>&1 || true
  docker ps -q --filter "publish=443" | xargs -r docker stop >/dev/null 2>&1 || true

  ok "端口处理完成"
}

# 克隆代码（优化：浅克隆加速，仅拉取最新提交）
clone_repo() {
  local pat="$1"
  log "同步项目代码到 $PROJECT_DIR ..."

  mkdir -p /var/www
  cd /var/www || exit 1

  local repo_url="https://${pat}@github.com/${REPO_OWNER}/${REPO_NAME}.git"

  if [[ ! -d "$PROJECT_DIR/.git" ]]; then
    rm -rf "$PROJECT_DIR"
    # 浅克隆：仅拉取最新1次提交，加速克隆
    git clone --depth 1 "$repo_url" "$PROJECT_DIR" >/dev/null 2>&1
  else
    cd "$PROJECT_DIR" || exit 1
    git fetch origin --depth 1 >/dev/null 2>&1
    git reset --hard origin/main >/dev/null 2>&1
  fi

  ok "代码同步完成"
}

# 创建目录（优化：一次性创建所有目录）
ensure_dirs() {
  log "创建必要目录..."
  mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads" "$DIST_DIR/.well-known/acme-challenge" || true
  chmod -R 755 "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads" "$DIST_DIR/.well-known" || true
  # 解决日志权限问题：提前设置目录属主为容器内的用户
  chown -R 1000:1000 "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads" || true
  ok "目录创建完成"
}

# 创建占位.env（优化：减少重复写入）
ensure_stub_env() {
  local env_path="$PROJECT_DIR/.env"
  # 修复：条件判断添加引号，避免空值解析错误
  if [[ -f "$env_path" && $(grep -c "MONGODB_URI=placeholder" "$env_path") -gt 0 ]]; then
    log "占位 .env 已存在，跳过"
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

# 构建前端（优化：缓存node_modules，加速构建）
build_frontend() {
  log "构建 Angular 前端（保证 dist 不为空）..."
  cd "$CLIENT_DIR" || exit 1

  [[ -f package.json ]] || die "未找到 $CLIENT_DIR/package.json，无法构建前端"

  # 环境变量优化：禁止交互
  export CI=1
  export NG_CLI_ANALYTICS=false
  export npm_config_legacy_peer_deps=true

  # 缓存node_modules（使用本地缓存，避免重复下载）
  local node_modules_cache="$HOME/.npm-cache/quoteonline-node_modules"
  if [[ ! -d "$node_modules_cache" ]]; then
    # 安装依赖
    npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund >/dev/null 2>&1 || \
    npm install --registry=https://registry.npmmirror.com --no-audit --no-fund >/dev/null 2>&1
    # 缓存依赖
    cp -r node_modules "$node_modules_cache" || true
  else
    # 使用缓存
    cp -r "$node_modules_cache" node_modules || true
  fi

  # 复制环境文件
  cp -f "$PROJECT_DIR/client/src/environments/environment.prod.ts" "$PROJECT_DIR/client/environment.ts" || true

  # 构建优化：使用并行构建
  if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts['build:optimized']?0:1)" >/dev/null 2>&1; then
    npm run -s build:optimized -- --no-interactive --parallel "$DOCKER_BUILD_PARALLEL"
  else
    ng build --configuration production --no-interactive --parallel "$DOCKER_BUILD_PARALLEL"
  fi

  [[ -f "$DIST_DIR/index.html" ]] || die "前端构建失败：$DIST_DIR/index.html 不存在（dist 为空）"
  ok "前端构建完成：$DIST_DIR"
}

# 生成HTTP-only Nginx配置（无变化，保持原有逻辑）
write_nginx_http_only() {
  local domain="$1"
  local domain_www="www.${domain}"

  log "生成 Nginx HTTP-only 配置（用于 certbot webroot 验证）..."

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

# 启动容器（优化：使用--no-cache避免缓存问题，仅在首次构建时构建）
compose_up_http() {
  log "启动容器（HTTP 模式先跑起来，供 webroot 验证）..."
  cd "$PROJECT_DIR" || exit 1
  # 仅在首次启动时构建，后续直接启动
  local build_flag="$PROJECT_DIR/.docker_build_done"
  if [[ ! -f "$build_flag" ]]; then
    docker compose down || true
    docker compose up -d --build --parallel "$DOCKER_BUILD_PARALLEL"
    touch "$build_flag"
  else
    docker compose down || true
    docker compose up -d
  fi
  ok "容器启动完成"
}

# DNS检查（优化：使用多个DNS服务器验证）
dns_check() {
  local domain="$1"
  log "检查 DNS 解析（避免 NXDOMAIN）..."
  # 兼容dig未安装的情况
  if ! command -v dig >/dev/null 2>&1; then
    if ! getent ahosts "$domain" >/dev/null 2>&1; then
      die "DNS 未解析：$domain（请先把 A 记录指到本机公网/Reserved IP，等待生效后再跑）"
    fi
  else
    # 使用8.8.8.8和114.114.114.114双DNS验证
    if ! dig +short "@8.8.8.8" "$domain" && ! dig +short "@114.114.114.114" "$domain"; then
      die "DNS 未解析：$domain（请先把 A 记录指到本机公网/Reserved IP，等待生效后再跑）"
    fi
  fi
  ok "DNS 解析正常"
}

# 申请证书（优化：跳过重复申请）
obtain_cert_webroot_test() {
  local domain="$1"
  local domain_www="www.${domain}"
  local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"

  if [[ -f "$cert_path" ]]; then
    log "测试证书已存在，跳过申请"
    ok "测试证书已就绪：$cert_path"
    return
  fi

  log "申请 SSL 证书（webroot + --test-cert）..."

  certbot certonly --webroot \
    -w "$DIST_DIR" \
    -d "$domain" -d "$domain_www" \
    --non-interactive --agree-tos --register-unsafely-without-email \
    --test-cert >/dev/null 2>&1

  [[ -f "$cert_path" ]] || die "证书文件不存在，申请失败"
  ok "测试证书申请成功：/etc/letsencrypt/live/${domain}/"
}

# 生成HTTPS Nginx配置（无变化）
write_nginx_https_from_template() {
  local domain="$1"
  log "生成 HTTPS nginx.conf（基于模板替换 {{DOMAIN}}）..."

  [[ -f "$NGINX_TEMPLATE" ]] || die "找不到模板：$NGINX_TEMPLATE"

  sed "s/{{DOMAIN}}/${domain}/g" "$NGINX_TEMPLATE" > "$NGINX_CONF"
  ok "HTTPS nginx.conf 已生成：$NGINX_CONF"
}

# 重启Nginx容器（无变化）
restart_nginx_container() {
  log "重启 nginx 容器..."
  cd "$PROJECT_DIR" || exit 1
  docker compose restart nginx >/dev/null 2>&1
  ok "nginx 已重启"
}

# 配置证书自动续期（优化：避免重复添加cron任务）
setup_renew_cron() {
  log "配置证书自动续期（cron：每天 03:00 renew + 重启 nginx）..."
  # 检查是否已存在该cron任务
  if ! crontab -l 2>/dev/null | grep -q "certbot renew --quiet && cd $PROJECT_DIR && docker compose restart nginx"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && cd $PROJECT_DIR && docker compose restart nginx >/dev/null 2>&1") | crontab -
  fi
  ok "自动续期已设置"
}

# 触发Workflow（优化：添加超时控制+错误重试）
trigger_workflow() {
  local pat="$1"
  local domain="$2"
  local retry=3

  log "触发 GitHub Actions（下发 .env）..."
  # 重试机制：失败后重试3次
  while [[ $retry -gt 0 ]]; do
    if curl -fsSL -X POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${pat}" \
      "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches" \
      -d @- >/dev/null <<EOF
{
  "ref": "main",
  "inputs": { "domain": "${domain}" }
}
EOF
    then
      ok "Workflow 已触发"
      return
    else
      retry=$((retry-1))
      warn "Workflow 触发失败，剩余重试次数：$retry"
      sleep 5
    fi
  done
  die "Workflow 触发失败，已重试3次"
}

# 等待真实.env（优化：缩短轮询间隔+超时时间）
wait_for_env_nonplaceholder() {
  log "等待 GitHub Actions 下发真实 .env ..."
  local env_path="$PROJECT_DIR/.env"
  local i=0
  local interval=1  # 轮询间隔从2秒缩短到1秒

  while true; do
    i=$((i+1))
    # 修复：拆分条件判断，避免空值导致的解析错误
    if [[ -s "$env_path" ]]; then
      if grep -q '^MONGODB_URI=' "$env_path" && ! grep -q '^MONGODB_URI=placeholder' "$env_path"; then
        chmod 600 "$env_path" || true
        ok "真实 .env 已就绪：$env_path"
        return
      fi
    fi
    if [[ $i -gt $WAIT_ENV_TIMEOUT ]]; then
      die "等待超时：workflow 可能未成功 scp .env 到服务器（请去 GitHub Actions 看日志）"
    fi
    sleep "$interval"
  done
}

# 重启容器（优化：仅重启变化的服务）
compose_restart_all() {
  log "确保容器加载新 .env ..."
  cd "$PROJECT_DIR" || exit 1
  # 仅重启backend服务（nginx无需重启，除非配置变化）
  docker compose up -d >/dev/null 2>&1
  docker compose restart backend >/dev/null 2>&1
  ok "服务已重启并加载新配置"
}

# -----------------------------
# 主流程（调整步骤顺序+优化执行逻辑）
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

# 核心步骤执行（按你的要求调整顺序）
PKG_MGR="$(detect_pkg_mgr)"
install_deps "$PKG_MGR"
free_ports
clone_repo "$GITHUB_PAT"
ensure_dirs

# 1) 构建前端（避免nginx 403）
build_frontend

# 2) 生成HTTP-only Nginx配置
write_nginx_http_only "$DOMAIN"

# 3) 生成占位.env
ensure_stub_env

# 4) 触发Workflow并等待真实.env（挪到容器启动前）
trigger_workflow "$GITHUB_PAT" "$DOMAIN"
wait_for_env_nonplaceholder

# 5) 启动容器（HTTP模式）
compose_up_http

# 6) DNS检查
dns_check "$DOMAIN"

# 7) 申请测试证书
obtain_cert_webroot_test "$DOMAIN"

# 8) 生成HTTPS配置并重启Nginx
write_nginx_https_from_template "$DOMAIN"
restart_nginx_container

# 9) 配置证书自动续期
setup_renew_cron

# 10) 重启容器加载最新配置（可选，确保万无一失）
compose_restart_all

echo ""
echo "=========================================="
ok "部署完成"
echo "访问：https://${DOMAIN}"
echo "项目目录：${PROJECT_DIR}"
echo "检查：docker compose -f ${PROJECT_DIR}/docker-compose.yml ps"
echo "=========================================="

# 清理临时文件
rm -f /tmp/.pkg_update_done