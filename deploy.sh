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
WAIT_ENV_TIMEOUT=120  # 等待.env的超时时间（秒）
DOCKER_BUILD_PARALLEL=2  # Docker构建并行数（仅用于前端构建）

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

# 安装依赖（优化：系统兼容+速度，同时支持CentOS/Ubuntu）
install_deps() {
  local mgr="$1"
  log "安装系统依赖（$mgr）..."

  # 优化：仅在首次安装时更新源，避免重复更新
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

  # 批量安装依赖（区分系统，解决Ubuntu/CentOS包名差异）
  if [[ "$mgr" == "apt" ]]; then
    # Ubuntu 依赖包（包含lsof/net-tools，避免后续端口检测缺失）
    apt install -y -qq git curl jq ca-certificates gnupg lsb-release openssl certbot python3-certbot-nginx lsof net-tools >/dev/null 2>&1
  else
    # CentOS 依赖包
    $mgr install -y -q git curl jq ca-certificates openssl certbot python3-certbot-nginx lsof net-tools >/dev/null 2>&1 || true
  fi

  # Docker安装（优化：使用国内镜像加速）
  install_docker() {
    if command -v docker >/dev/null 2>&1; then
      log "Docker 已安装，配置镜像加速"
      # 添加镜像加速配置
      mkdir -p /etc/docker
      cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["https://hub-mirror.c.163.com", "https://mirror.aliyuncs.com"]
}
EOF
      systemctl daemon-reload && systemctl restart docker >/dev/null 2>&1 || true
      systemctl enable --now docker >/dev/null 2>&1 || true
      return
    fi

    log "安装 Docker（加速版）..."
    # 国内镜像加速安装 Docker
    curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun >/dev/null 2>&1
    systemctl enable --now docker >/dev/null 2>&1 || true
    # 配置镜像加速
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["https://hub-mirror.c.163.com", "https://mirror.aliyuncs.com"]
}
EOF
    systemctl daemon-reload && systemctl restart docker >/dev/null 2>&1 || true
  }

  # Docker Compose安装（优化：使用更快的下载源）
  install_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
      log "Docker Compose 已安装，跳过"
      return
    fi

    log "安装 Docker Compose..."
    mkdir -p /usr/local/lib/docker/cli-plugins
    # 国内镜像加速下载
    curl -SL "https://mirror.ghproxy.com/https://github.com/docker/compose/releases/download/v2.29.2/docker-compose-linux-x86_64" \
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

# 释放端口（优化：彻底释放80/443，兼容CentOS/Ubuntu）
free_ports() {
  log "释放 80/443 端口占用..."

  # 第一步：停止系统自带的Web服务（Nginx/Apache）
  local services=("nginx" "apache2" "httpd")
  for svc in "${services[@]}"; do
    if command -v systemctl >/dev/null 2>&1; then
      sudo systemctl stop "$svc" >/dev/null 2>&1 || true
      sudo systemctl disable "$svc" >/dev/null 2>&1 || true
    fi
    # 兼容非systemd系统
    sudo service "$svc" stop >/dev/null 2>&1 || true
  done

  # 第二步：查找并杀死占用80/443的进程（兼容lsof未安装）
  if command -v lsof >/dev/null 2>&1; then
    for port in 80 443; do
      local pids
      pids=$(lsof -t -i:"$port" -sTCP:LISTEN 2>/dev/null || true)
      if [[ -n "$pids" ]]; then
        sudo kill -9 $pids >/dev/null 2>&1 || true
      fi
    done
  else
    # 备用方案：用netstat查找进程
    if command -v netstat >/dev/null 2>&1; then
      for port in 80 443; do
        local pids
        pids=$(netstat -tulpn | grep ":$port" | awk '{print $7}' | cut -d'/' -f1 | grep -E '^[0-9]+$' || true)
        if [[ -n "$pids" ]]; then
          sudo kill -9 $pids >/dev/null 2>&1 || true
        fi
      done
    fi
  fi

  # 第三步：停掉占用80/443的docker容器
  if command -v docker >/dev/null 2>&1; then
    # 兼容xargs参数差异
    if xargs --help 2>&1 | grep -q -- --no-run-if-empty; then
      docker ps -q --filter "publish=80"  | xargs --no-run-if-empty sudo docker stop >/dev/null 2>&1 || true
      docker ps -q --filter "publish=443" | xargs --no-run-if-empty sudo docker stop >/dev/null 2>&1 || true
    else
      docker ps -q --filter "publish=80"  | xargs -r sudo docker stop >/dev/null 2>&1 || true
      docker ps -q --filter "publish=443" | xargs -r sudo docker stop >/dev/null 2>&1 || true
    fi
  fi

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
  # 修复：先创建缓存目录的父目录
  mkdir -p "$HOME/.npm-cache" || true

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

  # 构建优化：使用并行构建（仅Angular构建使用）
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

# 启动容器（仅首次创建，无修改）
compose_up_http() {
  log "启动容器（HTTP 模式先跑起来，供 webroot 验证）..."
  cd "$PROJECT_DIR" || exit 1
  
  # 清理异常Docker网络
  local network_name="quoteonline_quote-network"
  if docker network inspect "$network_name" >/dev/null 2>&1; then
    docker network disconnect -f "$network_name" $(docker ps -q --filter "network=$network_name") >/dev/null 2>&1 || true
    docker network rm "$network_name" >/dev/null 2>&1 || true
  fi

  # 仅在首次启动时构建，后续直接启动
  local build_flag="$PROJECT_DIR/.docker_build_done"
  if [[ ! -f "$build_flag" ]]; then
    docker compose down || true
    docker compose up -d --build  # 第一次创建容器（仅执行一次）
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

# 申请证书（优化：添加超时+错误输出+端口验证）
obtain_cert_webroot_test() {
  local domain="$1"
  local domain_www="www.${domain}"
  local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
  local webroot="/var/www/QuoteOnline/client/dist/quote-online-client"

  if [[ -f "$cert_path" ]]; then
    log "测试证书已存在，跳过申请"
    ok "测试证书已就绪：$cert_path"
    return
  fi

  # 前置检查：确保80端口对外可访问
  log "检查 80 端口是否对外可访问..."
  if ! curl -I --connect-timeout 10 http://"$domain"/.well-known/acme-challenge/test 2>/dev/null; then
    warn "80端口可能被拦截，HTTP-01验证可能失败，请确保80端口对外开放"
  fi

  log "申请 SSL 证书（webroot + --test-cert）..."

  # 修复：添加超时控制+详细输出
  if ! timeout 120 certbot certonly --webroot \
    -w "$webroot" \
    -d "$domain" -d "$domain_www" \
    --agree-tos --register-unsafely-without-email \
    --test-cert --verbose 2>&1; then
    die "证书申请失败，请检查：1.80端口是否对外开放 2.webroot目录是否存在 3.域名解析是否正确"
  fi

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

# 配置证书自动续期（修复：兼容无现有cron任务）
setup_renew_cron() {
  log "配置证书自动续期（cron：每天 03:00 renew + 重启 nginx）..."
  # 定义cron任务内容
  local cron_task="0 3 * * * certbot renew --quiet && cd $PROJECT_DIR && docker compose restart nginx >/dev/null 2>&1"
  # 检查是否已存在该任务
  if ! crontab -l 2>/dev/null | grep -qF "$cron_task"; then
    (crontab -l 2>/dev/null || true; echo "$cron_task") | crontab -
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

# 等待真实.env（优化：单行动态计时输出，避免刷屏）
wait_for_env_nonplaceholder() {
  local env_path="$PROJECT_DIR/.env"
  local i=0
  local interval=1
  local timeout=$WAIT_ENV_TIMEOUT

  # 打印初始提示（仅一次）
  log "等待 GitHub Actions 下发真实 .env ... (超时时间: ${timeout}秒)"
  
  # 关闭命令执行的详细输出（避免循环内的命令日志刷屏）
  set +x
  
  while true; do
    i=$((i+1))
    # 检查.env文件是否有效（非空 + MONGODB_URI已替换）
    if [[ -s "$env_path" ]]; then
      if grep -q '^MONGODB_URI=' "$env_path" && ! grep -q '^MONGODB_URI=placeholder' "$env_path"; then
        chmod 600 "$env_path" || true
        # 清空当前行，打印成功提示
        printf "\r\033[K"  # 清空当前行
        ok "真实 .env 已就绪：$env_path (耗时 ${i}秒)"
        # 恢复命令详细输出（如果需要）
        set -x
        return
      fi
    fi

    # 检查超时
    if [[ $i -gt $timeout ]]; then
      printf "\r\033[K"  # 清空当前行
      # 恢复命令详细输出并退出
      set -x
      die "等待超时：workflow 可能未成功 scp .env 到服务器（请去 GitHub Actions 看日志）"
    fi

    # 单行动态更新计时（覆盖当前行）
    printf "\r⏳ 等待中... 已耗时 ${i}秒 / 超时 ${timeout}秒"
    sleep $interval
  done

  # 恢复命令详细输出（兜底）
  set -x
}

# 重启容器（修复核心：仅重启，不重建）
compose_restart_all() {
  log "确保容器加载新 .env ..."
  cd "$PROJECT_DIR" || exit 1
  
  # 检查容器是否存在，仅重启/启动，不创建
  local backend_status=$(docker compose ps -q backend)
  local nginx_status=$(docker compose ps -q nginx)
  
  if [[ -n "$backend_status" ]]; then
    docker compose restart backend >/dev/null 2>&1
  fi
  if [[ -n "$nginx_status" ]]; then
    docker compose restart nginx >/dev/null 2>&1
  fi
  
  # 兜底：若容器未运行，启动（不重建）
  if [[ -z "$backend_status" ]]; then
    docker compose start backend >/dev/null 2>&1 || warn "backend容器未创建，跳过启动"
  fi
  if [[ -z "$nginx_status" ]]; then
    docker compose start nginx >/dev/null 2>&1 || warn "nginx容器未创建，跳过启动"
  fi
  
  ok "服务已重启并加载新配置"
}

# -----------------------------
# 主流程
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

# 核心步骤执行
PKG_MGR="$(detect_pkg_mgr)"
install_deps "$PKG_MGR"
free_ports
clone_repo "$GITHUB_PAT"
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

echo ""
echo "=========================================="
ok "部署完成"
echo "访问：https://${DOMAIN}"
echo "项目目录：${PROJECT_DIR}"
echo "检查：docker compose -f ${PROJECT_DIR}/docker-compose.yml ps"
echo "=========================================="

# 清理临时文件
rm -f /tmp/.pkg_update_done