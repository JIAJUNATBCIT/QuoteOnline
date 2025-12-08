#!/bin/bash

echo "=== 防火墙状态检查 ==="
echo ""

# 检查系统类型
if [ -f /etc/debian_version ]; then
    echo "系统类型: Ubuntu/Debian"
    echo ""
    echo "UFW 防火墙状态:"
    sudo ufw status verbose
    echo ""
    echo "检查邮件端口出站规则:"
    sudo ufw status | grep -E "(465|587|25|2525)"
elif [ -f /etc/redhat-release ]; then
    echo "系统类型: CentOS/RHEL"
    echo ""
    echo "firewalld 防火墙状态:"
    sudo firewall-cmd --state
    echo ""
    echo "防火墙规则列表:"
    sudo firewall-cmd --list-all
    echo ""
    echo "检查邮件端口:"
    sudo firewall-cmd --list-ports | grep -E "(465|587|25|2525)"
else
    echo "未知系统类型"
fi

echo ""
echo "=== 网络连接测试 ==="
echo ""

# 测试端口连通性
echo "测试端口连通性 (timeout 10秒):"
timeout 10 bash -c "</dev/tcp/smtp.exmail.qq.com/465" && echo "✅ 465端口可连接" || echo "❌ 465端口无法连接"
timeout 10 bash -c "</dev/tcp/smtp.exmail.qq.com/587" && echo "✅ 587端口可连接" || echo "❌ 587端口无法连接"

echo ""
echo "=== 防火墙修复建议 ==="
echo ""

if [ -f /etc/debian_version ]; then
    echo "Ubuntu/Debian 修复命令:"
    echo "sudo ufw allow out 465/tcp"
    echo "sudo ufw allow out 587/tcp"
    echo "sudo ufw reload"
elif [ -f /etc/redhat-release ]; then
    echo "CentOS/RHEL 修复命令:"
    echo "sudo firewall-cmd --add-port=465/tcp --permanent"
    echo "sudo firewall-cmd --add-port=587/tcp --permanent"
    echo "sudo firewall-cmd --reload"
fi