# SendGrid邮件服务配置指南

## 📋 概述

为了绕过DigitalOcean的SMTP限制，我们已经将邮件服务从SMTP切换到SendGrid API。

## 🔧 配置步骤

### 1. 注册SendGrid账户

1. 访问 [SendGrid官网](https://sendgrid.com/)
2. 注册免费账户（免费版本每天可发送100封邮件）
3. 完成邮箱验证

### 2. 生成API Key

1. 登录SendGrid控制台
2. 进入 **Settings** > **API Keys**
3. 点击 **Create API Key**
4. 选择 **Restricted Access** 或 **Full Access**
5. 给API Key命名（如：quoteonline-email-service）
6. 复制生成的API Key

### 3. 配置发件人身份验证

1. 进入 **Settings** > **Sender Authentication**
2. 选择 **Domain Authentication** 或 **Single Sender Verification**
3. 如果选择 **Domain Authentication**（推荐）：
   - 添加你的域名（如：junbclistings.com）
   - 按照指示添加DNS记录
4. 如果选择 **Single Sender Verification**：
   - 添加发件人邮箱（如：sales@junbclistings.com）
   - 验证邮箱所有权

### 4. 更新环境变量

在 `.env` 和 `.env.production` 文件中替换：

```bash
# 将 YOUR_SENDGRID_API_KEY_HERE 替换为实际的API Key
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=sales@junbclistings.com
```

### 5. 测试邮件发送

运行测试脚本验证配置：

```bash
node test-sendgrid.js
```

**注意：** 修改测试脚本中的收件人邮箱为你的实际邮箱地址。

## 📊 SendGrid免费计划限制

- **每天100封邮件**
- **每小时最多40封邮件**
- **无品牌移除选项**

## 🚀 部署后检查

1. 确保生产环境的 `.env.production` 文件包含正确的SendGrid API Key
2. 部署到服务器后测试询价创建功能
3. 检查邮件是否正常发送

## 🛠 故障排除

### 常见错误

1. **API Key无效**
   - 检查API Key是否正确复制
   - 确认API Key有足够权限

2. **发件人未验证**
   - 确认发件人邮箱或域名已通过验证
   - 检查DNS记录是否正确配置

3. **达到发送限制**
   - 检查SendGrid控制台的发送统计
   - 考虑升级计划

### 调试技巧

- 查看SendGrid控制台的 **Activity** 页面跟踪邮件状态
- 检查应用日志中的邮件发送错误
- 使用测试脚本独立验证SendGrid配置

## 📞 技术支持

如遇到问题，可以：
1. 查看SendGrid官方文档
2. 检查SendGrid控制台的错误日志
3. 联系SendGrid技术支持

---

**配置完成后，记得删除 `test-sendgrid.js` 文件以避免API Key泄露。**