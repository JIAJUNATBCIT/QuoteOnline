#!/bin/bash

# 在线询价系统部署脚本
echo "🚀 开始部署在线询价系统..."

# 检查是否在正确的目录
if [ ! -f "server.js" ]; then
    echo "❌ 错误：请在项目根目录下运行此脚本"
    exit 1
fi

# 拉取最新代码
echo "📥 拉取最新代码..."
git pull origin main

# 安装后端依赖
echo "📦 安装后端依赖..."
npm install --production

# 安装前端依赖并构建
echo "🏗️ 构建前端应用..."
cd client
npm install
npm run build --prod
cd ..

# 复制生产环境配置
if [ -f ".env.production" ]; then
    echo "⚙️ 配置生产环境变量..."
    cp .env.production .env
    echo "✅ 已应用生产环境配置"
else
    echo "⚠️ 警告：未找到 .env.production 文件"
    echo "请手动配置环境变量"
fi

# 重启PM2进程
echo "🔄 重启后端服务..."
if pm2 list | grep -q "quoteonline-api"; then
    pm2 restart quoteonline-api
else
    pm2 start server.js --name "quoteonline-api"
fi

# 配置Nginx域名
echo "🌐 配置Nginx域名..."
if [ -f "nginx/portal.ooishipping.com.conf" ]; then
    sudo cp nginx/portal.ooishipping.com.conf /etc/nginx/sites-available/
    sudo ln -sf /etc/nginx/sites-available/portal.ooishipping.com.conf /etc/nginx/sites-enabled/
    
    # 删除默认配置
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # 测试配置
    sudo nginx -t
    if [ $? -eq 0 ]; then
        echo "✅ Nginx配置验证通过"
        sudo systemctl reload nginx
    else
        echo "❌ Nginx配置有误，请检查配置文件"
        exit 1
    fi
else
    echo "⚠️ 未找到域名配置文件，使用默认配置"
    sudo systemctl reload nginx
fi

# 检查服务状态
echo "🔍 检查服务状态..."
pm2 status
echo ""
sudo systemctl status nginx --no-pager

# 显示应用日志
echo ""
echo "📋 应用启动日志："
pm2 logs quoteonline-api --lines 20

echo ""
echo "✅ 部署完成！"
echo "🌐 您的应用现在应该可以访问了"
echo "📊 使用 'pm2 logs quoteonline-api' 查看实时日志"
echo "📊 使用 'pm2 monit' 查看监控面板"