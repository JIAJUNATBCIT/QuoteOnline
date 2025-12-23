#!/usr/bin/env bash
set -euo pipefail

# 纯文本banner（无echo -e和颜色）
echo "=========================================="
echo "  QuoteOnline One-Click Deploy (Stable)"
echo "  Bridge network + webroot TLS + GH env"
echo "  (keeps --test-cert)"
echo "=========================================="
echo ""

# -----------------------------
# 配置常量（可根据项目调整）
# -----------------------------
PROJECT_DIR="/var/www/QuoteOnline"
REPO_OWNER="JIAJUNATBCIT"
REPO_NAME="QuoteOnline"
WORKFLOW_FILE="deploy-from-clone.yml"
CLIENT_DIR="$PROJECT_DIR/client"
DIST_DIR="$CLIENT_DIR/dist/quote-online-client"
NGINX_TEMPLATE="$CLIENT_DIR/nginx.conf.template"
NGINX_CONF="$CLIENT_DIR/nginx.conf"
WAIT_ENV_TIMEOUT=120  # .env等待超时（秒）
DOCKER_BUILD_PARALLEL=2  # 前端构建并行数

# -----------------------------
# 工具函数（纯文本输出，无echo -e）
# -----------------------------
log()  { echo "▶ $*"; }
ok()   { echo "✅ $*"; }
warn() { echo "⚠️ $*" >&2; }
die()  { echo "❌ $*" >&2; exit 1; }

# 检查root权限
need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    die "请用 root 运行（或 sudo -i 后再执行）"
  fi
}

# 检测包管理器（apt/dnf/yum）
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

# 安装系统依赖（兼容CentOS/Ubuntu）
install_deps() {
  local mgr="$1"
  log "安装系统依赖（$mgr）..."

  # 仅首次更新源
  local update_flag="/tmp/.pkg_update_done"
  if [[ ! -f "$update_flag" ]]; then
    if [[ "$mgr" == "apt" ]]; then
      apt update -y >/dev/null 2>&1 || true
    else
      $mgr install -y epel-release >/dev/null 2>&1 || true
      $mgr update -y >/dev/null 2>&1 || true
    fi
    touch "$update_flag"
  fi

  # 安装核心依赖
  local deps_common=(git curl jq openssl certbot lsof net-tools)
  local deps_apt=(ca-certificates gnupg lsb-release python3-certbot-nginx)
  local deps_yum=(python3-certbot-nginx httpd-tools)

  if [[ "$mgr" == "apt" ]]; then
    apt install -y -qq "${deps_common[@]}" "${deps_apt[@]}" >/dev/null 2>&1
  else
    $mgr install -y -q "${deps_common[@]}" "${deps_yum[@]}" >/dev/null 2>&1 || true
  fi

  # 安装Docker（国内镜像加速）
  install_docker() {
    if command -v docker >/dev/null 2>&1; then
      log "Docker 已安装，配置镜像加速"
    else
      log "安装 Docker（国内加速版）..."
      curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun >/dev/null 2>&1
    fi

    # 配置Docker镜像加速
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["https://hub-mirror.c.163.com", "https://mirror.aliyuncs.com"]
}
EOF
    systemctl daemon-reload && systemctl restart docker >/dev/null 2>&1 || true
    systemctl enable --now docker >/dev/null 2>&1 || true
  }

  # 安装Docker Compose（国内源）
  install_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
      log "Docker Compose 已安装，跳过"
      return
    fi
    log "安装 Docker Compose..."
    mkdir -p /usr/local/lib/docker/cli-plugins
    curl -SL "https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose >/dev/null 2>&1
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  }

  # 安装Node.js 20（nvm加速）
  install_node() {
    if command -v node >/dev/null 2>&1 && node -v | grep -q "v20"; then
      log "Node.js 20 已安装，跳过"
      return
    fi
    log "安装 Node.js 20（nvm 加速版）..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash >/dev/null 2>&1
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    nvm install 20 >/dev/null 2>&1
    nvm alias default 20 >/dev/null 2>&1
    ln -s "$NVM_DIR/versions/node/v20*/bin/node" /usr/local/bin/node || true
    ln -s "$NVM_DIR/versions/node/v20*/bin/npm" /usr/local/bin/npm || true
  }

  # 安装Angular CLI（国内镜像）
  install_angular_cli() {
    if command -v ng >/dev/null 2>&1; then
      log "Angular CLI 已安装，跳过"
      return
    fi
    log "安装 Angular CLI..."
    npm install -g @angular/cli --registry=https://registry.npmmirror.com >/dev/null 2>&1
  }

  # 执行安装
  install_docker
  install_docker_compose
  install_node
  install_angular_cli

  ok "依赖安装完成"
}

# 彻底释放80/443端口
free_ports() {
  log "释放 80/443 端口占用..."

  # 停止系统Web服务
  local services=("nginx" "apache2" "httpd")
  for svc in "${services[@]}"; do
    systemctl stop "$svc" >/dev/null 2>&1 || true
    systemctl disable "$svc" >/dev/null 2>&1 || true
    service "$svc" stop >/dev/null 2>&1 || true
  done

  # 杀死端口占用进程
  if command -v lsof >/dev/null 2>&1; then
    for port in 80 443; do
      local pids=$(lsof -t -i:"$port" -sTCP:LISTEN 2>/dev/null || true)
      [[ -n "$pids" ]] && kill -9 $pids >/dev/null 2>&1 || true
    done
  elif command -v netstat >/dev/null 2>&1; then
    for port in 80 443; do
      local pids=$(netstat -tulpn | grep ":$port" | awk '{print $7}' | cut -d'/' -f1 | grep -E '^[0-9]+$' || true)
      [[ -n "$pids" ]] && kill -9 $pids >/dev/null 2>&1 || true
    done
  fi

  # 停止端口占用容器
  if command -v docker >/dev/null 2>&1; then
    local filter_publish_80="publish=80"
    local filter_publish_443="publish=443"
    if xargs --help 2>&1 | grep -q -- --no-run-if-empty; then
      docker ps -q --filter "$filter_publish_80" | xargs --no-run-if-empty docker stop >/dev/null 2>&1 || true
      docker ps -q --filter "$filter_publish_443" | xargs --no-run-if-empty docker stop >/dev/null 2>&1 || true
    else
      docker ps -q --filter "$filter_publish_80" | xargs -r docker stop >/dev/null 2>&1 || true
      docker ps -q --filter "$filter_publish_443" | xargs -r docker stop >/dev/null 2>&1 || true
    fi
  fi

  ok "端口处理完成"
}

# 克隆项目代码（浅克隆）
clone_repo() {
  local pat="$1"
  log "同步项目代码到 $PROJECT_DIR ..."

  mkdir -p /var/www && cd /var/www || exit 1
  local repo_url="https://${pat}@github.com/${REPO_OWNER}/${REPO_NAME}.git"

  if [[ ! -d "$PROJECT_DIR/.git" ]]; then
    rm -rf "$PROJECT_DIR"
    git clone --depth 1 "$repo_url" "$PROJECT_DIR" >/dev/null 2>&1
  else
    cd "$PROJECT_DIR" && git fetch origin --depth 1 >/dev/null 2>&1 && git reset --hard origin/main >/dev/null 2>&1
  fi

  ok "代码同步完成"
}

# 生成.dockerignore（优化构建上下文）
generate_dockerignore() {
  log "生成.dockerignore，优化构建上下文..."

  # Backend .dockerignore
  cat > "$PROJECT_DIR/backend/.dockerignore" <<EOF
node_modules/
dist/
logs/
uploads/
.git/
.gitignore
.env
*.log
EOF

  # Nginx .dockerignore（若存在）
  [[ -d "$PROJECT_DIR/nginx" ]] && cat > "$PROJECT_DIR/nginx/.dockerignore" <<EOF
.git/
.gitignore
*.log
EOF

  ok ".dockerignore 生成完成"
}

# 创建项目目录
ensure_dirs() {
  log "创建必要目录..."
  mkdir -p "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads" "$DIST_DIR/.well-known/acme-challenge" || true
  chmod -R 755 "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads" || true
  chown -R 1000:1000 "$PROJECT_DIR/logs" "$PROJECT_DIR/uploads" || true
  ok "目录创建完成"
}

# 创建占位.env
ensure_stub_env() {
  local env_path="$PROJECT_DIR/.env"
  if [[ -f "$env_path" && $(grep -c "MONGODB_URI=placeholder" "$env_path") -gt 0 ]]; then
    log "占位 .env 已存在，跳过"
    return
  fi

  log "创建占位 .env..."
  cat > "$env_path" <<EOF
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://${DOMAIN}
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

# Placeholders (overwritten by GitHub Actions)
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

# 构建前端代码
build_frontend() {
  log "构建 Angular 前端..."
  cd "$CLIENT_DIR" || die "未找到前端目录：$CLIENT_DIR"

  # 环境变量配置
  export CI=1
  export NG_CLI_ANALYTICS=false
  export npm_config_legacy_peer_deps=true

  # 缓存node_modules
  local node_cache="$HOME/.npm-cache/quoteonline-node_modules"
  mkdir -p "$node_cache" || true
  if [[ ! -d "$node_cache" ]]; then
    npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund >/dev/null 2>&1 || \
    npm install --registry=https://registry.npmmirror.com --no-audit --no-fund >/dev/null 2>&1
    cp -r node_modules "$node_cache" || true
  else
    cp -r "$node_cache" node_modules || true
  fi

  # 构建前端
  cp -f "$CLIENT_DIR/src/environments/environment.prod.ts" "$CLIENT_DIR/environment.ts" || true
  if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts['build:optimized']?0:1)" >/dev/null 2>&1; then
    npm run -s build:optimized -- --no-interactive --parallel "$DOCKER_BUILD_PARALLEL"
  else
    ng build --configuration production --no-interactive --parallel "$DOCKER_BUILD_PARALLEL"
  fi

  [[ -f "$DIST_DIR/index.html" ]] || die "前端构建失败：$DIST_DIR/index.html 不存在"
  ok "前端构建完成：$DIST_DIR"
}

# 生成HTTP-only Nginx配置
write_nginx_http_only() {
  local domain="$1"
  log "生成 HTTP-only Nginx 配置..."

  cat > "$NGINX_CONF" <<EOF
server {
  listen 80;
  server_name ${domain} www.${domain};

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

  ok "HTTP-only 配置已生成：$NGINX_CONF"
}

# 启动容器（清理冲突+无缓存构建）
compose_up_http() {
  log "启动容器（HTTP模式）..."
  cd "$PROJECT_DIR" || exit 1

  # 1. 删除同名镜像（避免冲突）
  local images=("quoteonline-backend:latest" "quoteonline-nginx:latest")
  for img in "${images[@]}"; do
    docker images -q "$img" >/dev/null 2>&1 && docker rmi -f "$img" >/dev/null 2>&1 || true
  done

  # 2. 清理异常网络
  local network="quoteonline_quote-network"
  if docker network inspect "$network" >/dev/null 2>&1; then
    docker network disconnect -f "$network" $(docker ps -q --filter "network=$network") >/dev/null 2>&1 || true
    docker network rm "$network" >/dev/null 2>&1 || true
  fi

  # 3. 删除同名容器
  local containers=("quoteonline-backend-1" "quoteonline-nginx-1")
  for container in "${containers[@]}"; do
    docker ps -a --filter "name=$container" >/dev/null 2>&1 && docker rm -f "$container" >/dev/null 2>&1 || true
  done

  # 4. 构建+启动容器
  local build_flag="$PROJECT_DIR/.docker_build_done"
  if [[ ! -f "$build_flag" ]]; then
    docker compose down -v --remove-orphans >/dev/null 2>&1 || true
    docker compose build --no-cache >/dev/null 2>&1
    docker compose up -d
    touch "$build_flag"
  else
    docker compose down -v --remove-orphans >/dev/null 2>&1 || true
    docker compose up -d
  fi

  ok "容器启动完成"
}

# 检查DNS解析
dns_check() {
  local domain="$1"
  log "检查 DNS 解析..."

  if command -v dig >/dev/null 2>&1; then
    if ! dig +short "@8.8.8.8" "$domain" && ! dig +short "@114.114.114.114" "$domain"; then
      die "DNS解析失败：$domain（请确认A记录指向本机IP）"
    fi
  else
    if ! getent ahosts "$domain" >/dev/null 2>&1; then
      die "DNS解析失败：$domain（请确认A记录指向本机IP）"
    fi
  fi

  ok "DNS解析正常"
}

# 申请Let's Encrypt测试证书
obtain_cert_webroot_test() {
  local domain="$1"
  local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
  local webroot="$DIST_DIR"

  if [[ -f "$cert_path" ]]; then
    log "测试证书已存在，跳过申请"
    ok "测试证书就绪：$cert_path"
    return
  fi

  log "申请 SSL 测试证书..."
  if ! timeout 120 certbot certonly --webroot \
    -w "$webroot" -d "$domain" -d "www.${domain}" \
    --agree-tos --register-unsafely-without-email \
    --test-cert --verbose 2>&1; then
    die "证书申请失败：检查80端口是否开放/域名解析是否正确"
  fi

  [[ -f "$cert_path" ]] || die "证书文件不存在：$cert_path"
  ok "测试证书申请成功：$cert_path"
}

# 生成HTTPS Nginx配置
write_nginx_https_from_template() {
  local domain="$1"
  log "生成 HTTPS Nginx 配置..."

  [[ -f "$NGINX_TEMPLATE" ]] || die "未找到Nginx模板：$NGINX_TEMPLATE"
  sed "s/{{DOMAIN}}/${domain}/g" "$NGINX_TEMPLATE" > "$NGINX_CONF"
  ok "HTTPS配置已生成：$NGINX_CONF"
}

# 重启Nginx容器
restart_nginx_container() {
  log "重启 Nginx 容器..."
  cd "$PROJECT_DIR" || exit 1
  docker compose restart nginx >/dev/null 2>&1 || true
  ok "Nginx 已重启"
}

# 配置证书自动续期
setup_renew_cron() {
  log "配置证书自动续期..."
  local cron_task="0 3 * * * certbot renew --quiet && cd $PROJECT_DIR && docker compose restart nginx >/dev/null 2>&1"
  
  if ! crontab -l 2>/dev/null | grep -qF "$cron_task"; then
    (crontab -l 2>/dev/null || true; echo "$cron_task") | crontab -
  fi

  ok "证书自动续期已配置"
}

# 触发GitHub Actions下发.env
trigger_workflow() {
  local pat="$1"
  local domain="$2"
  local retry=3

  log "触发 GitHub Actions 下发.env..."
  while [[ $retry -gt 0 ]]; do
    if curl -fsSL -X POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${pat}" \
      "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches" \
      -d "{\"ref\":\"main\",\"inputs\":{\"domain\":\"${domain}\"}}" >/dev/null 2>&1; then
      ok "GitHub Actions 已触发"
      return
    else
      retry=$((retry-1))
      warn "触发失败，剩余重试次数：$retry"
      sleep 5
    fi
  done

  die "GitHub Actions 触发失败（已重试3次）"
}

# 动态等待.env（单行动态计时）
wait_for_env_nonplaceholder() {
  local env_path="$PROJECT_DIR/.env"
  local i=0
  local interval=1
  local timeout=$WAIT_ENV_TIMEOUT

  log "等待 GitHub Actions 下发.env... (超时：${timeout}秒)"
  set +x

  while true; do
    i=$((i+1))

    # 检查.env是否有效
    if [[ -s "$env_path" ]]; then
      if grep -q '^MONGODB_URI=' "$env_path" && ! grep -q '^MONGODB_URI=placeholder' "$env_path"; then
        chmod 600 "$env_path" || true
        printf "\r"
        ok "真实 .env 已就绪（耗时 ${i}秒）"
        set -x
        return
      fi
    fi

    # 超时检查
    if [[ $i -gt $timeout ]]; then
      printf "\r"
      set -x
      die ".env等待超时（${timeout}秒）：检查GitHub Actions是否执行成功"
    fi

    # 动态更新计时
    printf "\r⏳ 等待中... 已耗时 ${i}秒 / 超时 ${timeout}秒"
    sleep $interval
  done

  set -x
}

# 重启容器加载新.env（仅重启，不重建）
compose_restart_all() {
  log "重启容器加载新.env..."
  cd "$PROJECT_DIR" || exit 1

  local backend=$(docker compose ps -q backend)
  local nginx=$(docker compose ps -q nginx)

  [[ -n "$backend" ]] && docker compose restart backend >/dev/null 2>&1 || true
  [[ -n "$nginx" ]] && docker compose restart nginx >/dev/null 2>&1 || true

  # 兜底启动（若容器未运行）
  [[ -z "$backend" ]] && docker compose start backend >/dev/null 2>&1 || true
  [[ -z "$nginx" ]] && docker compose start nginx >/dev/null 2>&1 || true

  ok "容器已重启并加载新配置"
}

# -----------------------------
# 主部署流程
# -----------------------------
need_root

# 读取部署参数
log "读取部署参数"
read -p "请输入域名（如：portal.example.com）: " DOMAIN
[[ -n "${DOMAIN}" ]] || die "域名不能为空"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "域名格式不合法"

read -s -p "请输入 GitHub PAT（含repo/workflow权限）: " GITHUB_PAT
echo ""
[[ -n "${GITHUB_PAT}" ]] || die "GitHub PAT 不能为空"

# 核心部署步骤
PKG_MGR=$(detect_pkg_mgr)
install_deps "$PKG_MGR"
free_ports
clone_repo "$GITHUB_PAT"
generate_dockerignore
ensure_dirs
build_frontend
write_nginx_http_only "$DOMAIN"
ensure_stub_env
trigger_workflow "$GITHUB_PAT" "$DOMAIN"
wait_for_env_nonplaceholder
compose_up_http
dns_check "$DOMAIN"
obtain_cert_webroot_test "$DOMAIN"
write_nginx_https_from_template "$DOMAIN"
restart_nginx_container
setup_renew_cron
compose_restart_all

# 部署完成提示
echo ""
echo "=========================================="
ok "部署完成！"
echo "访问地址：https://${DOMAIN}"
echo "项目目录：$PROJECT_DIR"
echo "容器状态：docker compose -f $PROJECT_DIR/docker-compose.yml ps"
echo "日志查看：docker compose -f $PROJECT_DIR/docker-compose.yml logs"
echo "=========================================="

# 清理临时文件
rm -f /tmp/.pkg_update_done