#!/bin/bash

# ============================================
# 代码更新和容器重启脚本
# ============================================

set -eo pipefail

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 项目配置
PROJECT_DIR="/var/www/QuoteOnline"

log() { echo -e "${BLUE}[$(date '+%H:%M:%S')] $1${NC}"; }
success() { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓ $1${NC}"; }
error() { echo -e "${RED}[$(date '+%H:%M:%S')] ✗ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠ $1${NC}"; }

# 检查root权限
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "需要root权限"
        exit 1
    fi
    success "权限检查通过"
}

# 检查项目目录
check_project() {
    if [[ ! -d "$PROJECT_DIR" ]]; then
        error "项目目录不存在: $PROJECT_DIR"
        exit 1
    fi
    success "项目目录检查通过"
}

# 拉取最新代码
update_code() {
    log "拉取最新代码..."
    cd "$PROJECT_DIR" || { error "无法切换到项目目录"; exit 1; }
    
    # 检查是否为Git仓库
    if [[ ! -d ".git" ]]; then
        error "当前目录不是Git仓库"
        exit 1
    fi
    
    # 检查是否有未提交的更改
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
        warn "检测到未提交的更改，将强制覆盖..."
        
        # 强制重置到HEAD，丢弃所有本地更改
        git reset --hard HEAD || {
            error "重置本地更改失败"
            exit 1
        }
        
        # 清理未跟踪的文件
        git clean -fd || {
            warn "清理未跟踪文件失败，继续执行..."
        }
        
        success "本地更改已清理"
    fi
    
    # 获取最新代码
    git fetch origin || {
        error "获取远程代码失败"
        exit 1
    }
    
    # 强制覆盖本地代码
    git reset --hard origin/main || {
        error "代码重置失败"
        exit 1
    }
    
    success "代码更新完成（强制覆盖模式）"
}



# 构建前端代码
build_frontend() {
    log "构建前端代码..."
    cd "$PROJECT_DIR" || { error "无法切换到项目目录"; exit 1; }
    
    # 检查client目录是否存在
    if [[ ! -d "client" ]]; then
        error "client目录不存在"
        exit 1
    fi
    
    # 安装前端依赖（如果需要）
    if [[ ! -d "client/node_modules" ]]; then
        log "安装前端依赖..."
        cd client && npm install --no-audit --no-fund && cd .. || {
            error "安装前端依赖失败"
            exit 1
        }
    fi
    
    # 禁用 Angular CLI 交互并构建前端生产版本
    log "构建前端生产版本..."
    cd client
    
    # 设置环境变量完全禁用交互
    export NG_CLI_ANALYTICS=ci
    export NG_CLI_INTERACTIVE=false
    export NG_DISABLE_AUTO_COMPLETE=true
    export CI=true
    
    # 创建 angular.json 配置临时禁用自动补全
    if ! grep -q '"disableAutoComplete"' angular.json; then
        # 备份原始文件
        cp angular.json angular.json.bak
        # 临时添加禁用自动补全的配置
        sed -i 's/"cli": {/"cli": {\n      "disableAutoComplete": true,/' angular.json
    fi
    
    # 先尝试正常构建，如果失败再用 yes 处理交互
    timeout 300 npx ng build --configuration production --no-progress > /dev/null 2>&1 || \
    timeout 300 sh -c "echo 'n' | npx ng build --configuration production --no-progress" > /dev/null 2>&1 || \
    timeout 300 sh -c "yes 'n' | npx ng build --configuration production --no-progress" > /dev/null 2>&1
    
    # 检查构建是否成功（通过检查输出文件）
    if [[ ! -d "dist/quote-online-client" ]] || [[ ! -f "dist/quote-online-client/index.html" ]]; then
        # 恢复 angular.json
        mv angular.json.bak angular.json 2>/dev/null || true
        cd ..
        error "前端构建失败 - 输出文件不存在"
        exit 1
    fi
    
    # 恢复 angular.json
    mv angular.json.bak angular.json 2>/dev/null || true
    cd ..
    
    # 检查构建结果
    if [[ ! -d "client/dist/quote-online-client" ]]; then
        error "前端构建输出目录不存在"
        exit 1
    fi
    
    success "前端构建完成"
}

# 重启Docker容器
restart_containers() {
    log "重启Docker容器..."
    cd "$PROJECT_DIR" || { error "无法切换到项目目录"; exit 1; }
    
    # 检查docker-compose.yml是否存在
    if [[ ! -f "docker-compose.yml" ]]; then
        error "docker-compose.yml文件不存在"
        exit 1
    fi
    
    # 检查并修复 nginx.conf 问题
    if [[ ! -f "client/nginx.conf" ]]; then
        # 先删除可能存在的目录
        if [[ -d "client/nginx.conf" ]]; then
            log "删除错误的 nginx.conf 目录..."
            rm -rf client/nginx.conf
        fi
        
        log "创建默认 nginx.conf 文件..."
        
        # 检查是否有模板文件
        if [[ -f "client/nginx.conf.template" ]]; then
            log "使用模板文件生成 HTTPS 配置..."
            # 使用默认域名替换模板
            sed 's/{{DOMAIN}}/_/g' "client/nginx.conf.template" > "client/nginx.conf"
        elif [[ -f "client/nginx.http.conf" ]]; then
            log "使用 HTTP 配置文件..."
            # 使用 HTTP 配置并替换域名变量
            sed 's/{{DOMAIN}}/_/g' "client/nginx.http.conf" > "client/nginx.conf"
        else
            log "创建基础 HTTP 配置..."
            # 创建基础配置，API路径正确
            cat > "client/nginx.conf" <<'EOF'
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /.well-known/acme-challenge/ {
        root /usr/share/nginx/html;
        try_files $uri =404;
    }

    location /api/ {
        proxy_pass http://backend:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF
        fi
        success "默认 nginx.conf 已创建"
    fi
    
    # 清理Docker缓存和未使用的资源
    log "清理Docker缓存..."
    docker system prune -f || {
        warn "清理Docker缓存失败，继续执行..."
    }
    
    # 停止并移除容器
    log "停止并移除现有容器..."
    if docker compose down --volumes --remove-orphans 2>/dev/null; then
        success "容器停止成功"
    else
        warn "没有运行中的容器或停止失败，继续..."
    fi
    

    
    # 删除相关镜像以避免缓存问题
    log "删除相关镜像..."
    docker rmi quoteonline-backend:latest quoteonline-nginx:latest 2>/dev/null || {
        warn "删除镜像失败，继续执行..."
    }
    
    # 强制重新构建镜像
    log "强制重新构建镜像..."
    if docker compose build --pull --no-cache; then
        success "镜像构建成功"
    else
        error "镜像构建失败"
        exit 1
    fi
    
    # 启动容器
    log "启动容器..."
    if docker compose up -d --force-recreate; then
        success "容器启动成功"
    else
        error "容器启动失败"
        docker compose ps
        exit 1
    fi
    
    # 等待服务启动
    log "等待服务启动..."
    sleep 20
    
    # 检查容器状态
    if docker compose ps | grep -q "Up"; then
        success "容器状态正常"
    else
        error "容器启动失败"
        docker compose ps
        docker compose logs --tail=50
        exit 1
    fi
}

# 健康检查
health_check() {
    log "执行健康检查..."
    sleep 10
    
    # 检查后端容器健康状态（通过 Docker 内部健康检查）
    if docker compose exec backend curl -f http://localhost:3000/health >/dev/null 2>&1; then
        success "后端服务健康检查通过"
    else
        warn "后端服务健康检查失败，但容器仍在运行"
    fi
    
    # 检查前端是否通过 NGINX 可访问
    # 先尝试HTTP，如果失败再尝试健康检查端点
    if curl -f http://localhost/health >/dev/null 2>&1; then
        success "前端服务通过 NGINX 访问正常"
    elif curl -k -f https://localhost/health >/dev/null 2>&1; then
        success "前端服务通过 NGINX HTTPS 访问正常"
    else
        warn "前端服务通过 NGINX 访问失败，但容器仍在运行"
        # 显示NGINX状态用于调试
        docker compose logs nginx --tail=10 2>/dev/null || true
    fi
}

# 显示信息
show_info() {
    log "部署信息:"
    echo "----------------------------------------"
    echo "项目目录: $PROJECT_DIR"
    echo "更新时间: $(date)"
    echo "Git提交: $(git rev-parse --short HEAD 2>/dev/null || echo '未知')"
    echo "----------------------------------------"
}

# 主函数
main() {
    echo "========================================"
    echo "      代码更新和容器重启"
    echo "      强制覆盖模式"
    echo "========================================"
    
    check_root
    check_project
    update_code
    build_frontend
    restart_containers
    health_check
    show_info
    
    success "🎉 更新完成！"
}

# 执行主函数
main "$@"