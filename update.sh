#!/bin/bash

# ============================================
# 代码更新和容器重启脚本
# ============================================

set -euo pipefail

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
    [[ $EUID -ne 0 ]] && { error "需要root权限"; exit 1; }
}

# 检查项目目录
check_project() {
    [[ -d "$PROJECT_DIR" ]] || { error "项目目录不存在: $PROJECT_DIR"; exit 1; }
}

# 拉取最新代码
update_code() {
    log "拉取最新代码..."
    cd "$PROJECT_DIR"
    
    # 检查是否有未提交的更改
    if ! git diff --quiet || ! git diff --cached --quiet; then
        warn "检测到未提交的更改，先暂存..."
        git stash push -m "自动更新前暂存 $(date)"
    fi
    
    git pull origin main
    success "代码更新完成"
}

# 重启Docker容器
restart_containers() {
    log "重启Docker容器..."
    cd "$PROJECT_DIR"
    
    # 停止容器
    docker compose down
    
    # 重新构建并启动
    docker compose up -d --build
    
    # 等待服务启动
    log "等待服务启动..."
    sleep 15
    
    # 检查容器状态
    if docker compose ps | grep -q "Up"; then
        success "容器重启成功"
    else
        error "容器启动失败"
        docker compose ps
        exit 1
    fi
}

# 健康检查
health_check() {
    log "执行健康检查..."
    sleep 10
    
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        success "服务健康检查通过"
    else
        warn "服务健康检查失败，但容器仍在运行"
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
    echo "========================================"
    
    check_root
    check_project
    update_code
    restart_containers
    health_check
    show_info
    
    success "🎉 更新完成！"
}

# 执行主函数
main "$@"