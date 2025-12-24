# 服务器部署更新指南

## 部署脚本

### 首次部署
**文件**: `deploy.sh`

用于在新服务器上首次部署项目，包含完整的安装和配置流程。

```bash
sudo ./deploy.sh
```

### 日常更新
**文件**: `update.sh`

用于拉取最新代码并重启Docker容器。

```bash
# SSH登录服务器后执行
sudo ./update.sh
```

#### 特性：
- ✅ 拉取最新代码
- ✅ 自动暂存未提交的更改
- ✅ 重启Docker容器
- ✅ 自动重新构建镜像
- ✅ 健康检查
- ✅ 简洁的日志输出

---

## 部署前检查清单

### 1. 环境检查
- [ ] 确认服务器有足够的磁盘空间（建议至少2GB可用空间）
- [ ] 确认Docker服务正在运行
- [ ] 确认Git配置正确
- [ ] 确认环境变量文件`.env`存在且配置正确

### 2. 代码检查
- [ ] 确认所有更改已提交到Git仓库
- [ ] 检查是否有未提交的敏感文件
- [ ] 确认分支正确（通常为main分支）

### 3. 服务检查
- [ ] 确认MongoDB连接正常
- [ ] 确认邮件服务配置正确
- [ ] 确认SSL证书有效（如使用HTTPS）

---

## 紧急回滚指南

如果部署后出现问题，可以按以下步骤回滚：

### 方法1：使用备份回滚

```bash
cd /var/www/QuoteOnline

# 停止当前服务
sudo docker compose down

# 查看可用备份
ls -la backups/

# 恢复最新备份（替换backup_20231224_143022为实际备份名）
sudo rm -rf ./*  # 小心操作！
sudo cp -r backups/backup_20231224_143022/* ./

# 重启服务
sudo docker compose up -d
```

### 方法2：使用Git回滚

```bash
cd /var/www/QuoteOnline

# 查看提交历史
git log --oneline -10

# 回滚到上一个提交
git reset --hard HEAD~1

# 重新构建并启动
sudo docker compose down
sudo docker compose up -d --build
```

---

## 监控和日志

### 查看容器状态

```bash
# 查看所有容器状态
docker compose ps

# 查看容器日志
docker compose logs -f backend
docker compose logs -f nginx

# 查看最近的日志
docker compose logs --tail=100 backend
```

### 查看应用日志

```bash
# 查看应用日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/error.log
```

### 健康检查

```bash
# 手动健康检查
curl http://localhost:3000/health

# 检查前端
curl -I http://localhost
```

---

## 常见问题解决

### 1. 容器启动失败

```bash
# 查看详细错误信息
docker compose logs backend

# 检查配置文件
cat .env

# 重新构建镜像
docker compose build --no-cache
```

### 2. 端口冲突

```bash
# 查看端口占用
sudo netstat -tulpn | grep :80
sudo netstat -tulpn | grep :3000

# 停止冲突服务
sudo systemctl stop nginx  # 如果系统nginx冲突
```

### 3. 磁盘空间不足

```bash
# 清理Docker
docker system prune -af

# 清理日志
sudo find /var/lib/docker -name "*.log" -exec truncate -s 0 {} \;

# 清理备份（保留最近3个）
cd backups
ls -t | tail -n +4 | xargs rm -rf
```

### 4. Git拉取失败

```bash
# 检查Git配置
git remote -v
git status

# 强制重置
git fetch origin
git reset --hard origin/main
```

---

## 自动化部署建议

### 1. 设置定时部署

可以设置cron任务定期检查更新：

```bash
# 编辑crontab
sudo crontab -e

# 每天凌晨2点检查更新（如果有新代码则自动部署）
0 2 * * * cd /var/www/QuoteOnline && git pull origin main && if [ $(git rev-parse HEAD) != $(git rev-parse @{1}) ]; then ./update-and-restart.sh; fi
```

### 2. Webhook集成

可以通过GitHub Webhook触发自动部署：

1. 在GitHub仓库设置中添加Webhook
2. 使用简单的Webhook服务器接收通知
3. 触发部署脚本执行

---

## 联系支持

如果在部署过程中遇到无法解决的问题，请：

1. 保存完整的错误日志
2. 记录部署前的系统状态
3. 提供服务器环境信息（操作系统、Docker版本等）
4. 联系技术支持团队

---

**注意**: 首次使用新的部署脚本时，建议在测试环境中先行验证，确保一切正常后再在生产环境使用。