#!/bin/bash

# SSL证书配置脚本 for portal.ooishipping.com
echo "🔒 开始配置SSL证书..."

DOMAIN="portal.ooishipping.com"
EMAIL="your-email@example.com"  # 请替换为您的邮箱

# 检查域名是否解析到此服务器
echo "🔍 检查域名DNS解析..."
if ! nslookup $DOMAIN > /dev/null 2>&1; then
    echo "⚠️ 警告：域名 $DOMAIN 可能未正确解析到此服务器"
    echo "请确保域名A记录指向此服务器IP地址"
    read -p "是否继续？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 安装Certbot
echo "📦 安装Certbot..."
sudo apt update
sudo apt install -y certbot python3-certbot-nginx

# 获取SSL证书
echo "🔑 获取SSL证书..."
sudo certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email $EMAIL \
    --domains $DOMAIN,www.$DOMAIN

if [ $? -eq 0 ]; then
    echo "✅ SSL证书配置成功！"
    
    # 设置自动续期
    echo "⏰ 设置证书自动续期..."
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    echo "✅ 已设置证书自动续期"
    
    # 显示证书信息
    echo "📋 证书信息："
    sudo certbot certificates
    
    # 测试续期
    echo "🧪 测试证书续期..."
    sudo certbot renew --dry-run
    
    echo ""
    echo "✨ SSL配置完成！"
    echo "🌐 您的应用现在可以通过以下地址访问："
    echo "   - http://$DOMAIN"
    echo "   - https://$DOMAIN"
    echo ""
    echo "🔧 Nginx已自动配置为HTTP重定向到HTTPS"
    
else
    echo "❌ SSL证书配置失败"
    echo "请检查："
    echo "1. 域名是否正确解析到此服务器"
    echo "2. 80端口是否开放"
    echo "3. 邮箱地址是否有效"
    exit 1
fi

# 重启Nginx确保配置生效
echo "🔄 重启Nginx服务..."
sudo systemctl reload nginx

echo "✅ 所有配置完成！"