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
    
    # 注意：nginx.conf 应该由 deploy.sh 在生产环境部署时生成
    # update.sh 不应该创建或修改 nginx.conf 文件
    # 这里只是确保开发环境不会因为 nginx.conf 文件而出错
    if [[ ! -f "client/nginx.conf" ]] && [[ -f "client/nginx.http.conf" ]]; then
        log "开发环境检测到缺失 nginx.conf，创建临时HTTP配置用于测试..."
        # 仅在开发环境创建临时配置
        sed 's/{{DOMAIN}}/localhost/g' "client/nginx.http.conf" > "client/nginx.conf"
        success "已创建开发环境临时nginx配置"
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

# 健康检查和故障排查
health_check() {
    log "执行健康检查和故障排查..."
    sleep 10
    
    log "=== 容器状态检查 ==="
    docker compose ps
    
    log "=== 端口占用检查 ==="
    netstat -tulpn | grep -E ':(80|443|3000)' || ss -tulpn | grep -E ':(80|443|3000)' || echo "端口检查工具不可用"
    
    log "=== 后端容器内部检查 ==="
    if docker compose exec backend curl -f http://localhost:3000/health >/dev/null 2>&1; then
        success "后端服务健康检查通过"
    else
        warn "后端服务健康检查失败"
        docker compose logs backend --tail=10
    fi
    
    log "=== NGINX 配置检查 ==="
    if docker compose exec nginx nginx -t >/dev/null 2>&1; then
        success "NGINX 配置语法正确"
    else
        error "NGINX 配置语法错误"
        docker compose exec nginx nginx -t
    fi
    
    log "=== 前端文件检查 ==="
    if docker compose exec nginx ls -la /usr/share/nginx/html/index.html >/dev/null 2>&1; then
        success "前端文件存在"
    else
        error "前端文件不存在"
        docker compose exec nginx ls -la /usr/share/nginx/html/ || true
    fi
    
    log "=== NGINX 访问测试 ==="
    # 先尝试容器内部
    if docker compose exec nginx curl -f http://localhost/health >/dev/null 2>&1; then
        success "NGINX 容器内部访问正常"
    else
        warn "NGINX 容器内部访问失败"
    fi
    
    # 尝试外部访问
    if curl -f http://localhost/health >/dev/null 2>&1; then
        success "前端服务通过 HTTP 访问正常"
    elif curl -k -f https://localhost/health >/dev/null 2>&1; then
        success "前端服务通过 HTTPS 访问正常"
    else
        warn "前端服务外部访问失败"
        
        log "=== NGINX 详细日志 ==="
        docker compose logs nginx --tail=20
        
        log "=== 网络连通性测试 ==="
        docker compose exec nginx wget -qO- http://backend:3000/api/health || echo "后端API不可达"
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