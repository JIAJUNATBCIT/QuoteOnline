#!/bin/bash

# 简化测试版本
set -eo pipefail

echo "开始测试..."

# 项目配置
PROJECT_DIR="/var/www/QuoteOnline"

# 检查root权限
echo "检查权限..."
if [[ $EUID -ne 0 ]]; then
    echo "需要root权限"
    exit 1
fi
echo "权限OK"

# 检查项目目录
echo "检查目录: $PROJECT_DIR"
if [[ ! -d "$PROJECT_DIR" ]]; then
    echo "目录不存在: $PROJECT_DIR"
    exit 1
fi
echo "目录OK"

# 切换目录
echo "切换目录..."
cd "$PROJECT_DIR" || {
    echo "无法切换到项目目录"
    exit 1
}
echo "切换OK"

# 检查Git
echo "检查Git..."
if ! command -v git &> /dev/null; then
    echo "Git未安装"
    exit 1
fi
echo "Git OK"

# 检查是否为Git仓库
echo "检查Git仓库..."
if [[ ! -d ".git" ]]; then
    echo "不是Git仓库"
    exit 1
fi
echo "Git仓库OK"

# 检查Docker
echo "检查Docker..."
if ! command -v docker &> /dev/null; then
    echo "Docker未安装"
    exit 1
fi
echo "Docker OK"

# 检查docker-compose
echo "检查docker-compose..."
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose未安装"
    exit 1
fi
echo "Docker Compose OK"

echo "所有检查通过！"