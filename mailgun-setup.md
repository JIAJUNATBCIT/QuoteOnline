# Mailgun邮件服务配置指南

## 📋 概述

将邮件服务从SendGrid迁移到Mailgun，解决Yahoo邮件投递问题。

## 🔧 配置步骤

### 1. 注册Mailgun账户

1. 访问 [Mailgun官网](https://www.mailgun.com/)
2. 注册免费账户（免费版本每月1000封邮件）
3. 完成邮箱验证

### 2. 验证发送域名

#### 方式1：使用Mailgun自带域名（快速开始）
- 注册后会自动获得一个沙盒域名
- 格式如：`sandboxxxxxxxxxxxxxxxxxxxxxxx.mailgun.org`
- 仅用于测试，不能用于生产环境

#### 方式2：验证自定义域名（推荐生产使用）

1. **进入Mailgun控制台**
   - 点击 **Domains** > **Add New Domain**
   - 输入域名：`mg.junbclistings.com`（推荐使用mg子域名）
   - 或者直接使用：`junbclistings.com`

2. **配置DNS记录**
   Mailgun会提供以下记录，需要添加到域名DNS：

   ```dns
   # TXT记录（验证域名所有权）
   "v=spf1 include:mailgun.org ~all"
   
   # MX记录（接收邮件）
   @  MX 10 mxa.mailgun.org
   @  MX 10 mxb.mailgun.org
   
   # CNAME记录（DKIM验证）
   k1._domainkey.junbclistings.com CNAME k1._domainkey.mailgun.org
   k2._domainkey.junbclistings.com CNAME k2._domainkey.mailgun.org
   ```

3. **等待DNS生效**（通常需要24-48小时）
4. 在Mailgun控制台点击 **"Check DNS Records"** 验证

### 3. 获取API Key

1. 进入 **Settings** > **API Keys**
2. 点击 **Create API Key**
3. 选择权限级别（推荐：**API key with all permissions**）
4. 复制生成的API Key（格式：`key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`）

### 4. 更新环境变量

在 `.env` 和 `.env.production` 文件中设置：

```bash
# 将 YOUR_MAILGUN_API_KEY_HERE 替换为实际的API Key
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mg.junbclistings.com
EMAIL_FROM=sales@junbclistings.com
```

### 5. 测试邮件发送

创建测试脚本验证配置：

```bash
node test-mailgun.js
```

## 🚀 部署步骤

### 1. 更新邮件服务引用

在需要发送邮件的文件中，将：
```javascript
const emailService = require('../services/emailService');
```
替换为：
```javascript
const emailService = require('../services/mailgunService');
```

### 2. 服务器部署

1. **更新服务器环境变量**：
   ```bash
   cd /var/www/QuoteOnline
   nano .env.production
   ```

2. **重启应用服务**：
   ```bash
   pm2 restart quoteonline
   ```

3. **测试邮件功能**：
   - 创建测试询价单
   - 检查邮件发送日志
   - 验证Yahoo邮箱接收

## 📊 Mailgun优势

| 特性 | Mailgun | SendGrid |
|------|---------|----------|
| **免费额度** | 1000封/月 | 100封/天 |
| **API设计** | RESTful，简洁 | 复杂 |
| **文档质量** | 清晰详细 | 相对复杂 |
| **Yahoo投递** | 更高成功率 | 经常限流 |
| **分析报告** | 详细实时 | 基础统计 |
| **Webhook** | 强大灵活 | 基础功能 |

## 🔍 监控和调试

### 1. Mailgun控制台监控
- **Logs**：查看所有邮件发送状态
- **Analytics**：分析投递率、打开率等
- **Suppressions**：管理退订和退回地址

### 2. 常见问题排查

#### DNS验证失败
```bash
# 检查SPF记录
nslookup -type=TXT junbclistings.com

# 检查MX记录
nslookup -type=MX junbclistings.com

# 检查DKIM记录
nslookup -type=CNAME k1._domainkey.junbclistings.com
```

#### 邮件发送失败
- 检查API Key是否正确
- 确认域名已验证
- 查看发送日志获取详细错误信息

#### Yahoo邮件问题
- 使用专门的mg子域名
- 确保SPF记录包含Mailgun
- 监控发送频率，避免被识别为垃圾邮件

## 🛠 进阶配置

### 1. 自定义邮件模板
在Mailgun控制台创建和管理邮件模板

### 2. Webhook配置
设置邮件事件通知：
```javascript
// 例子：接收投递状态回调
app.post('/webhook/mailgun', (req, res) => {
  const events = req.body['signature'];
  // 处理邮件投递事件
});
```

### 3. 域名发送限制
在Mailgun控制台设置发送配额和限制

## 📈 成本对比

| 服务商 | 免费额度 | 付费价格（每1000封） |
|--------|----------|-------------------|
| **Mailgun** | 1000封/月 | $0.80 |
| **SendGrid** | 100封/天 | $1.00 |
| **AWS SES** | 62,000封/月 | $0.10 |

## 🚀 迁移完成后

1. **删除旧的SendGrid相关文件**：
   ```bash
   rm services/emailService.js
   rm -rf @sendgrid/mail
   ```

2. **更新package.json依赖**（可选）

3. **监控邮件投递情况**：
   - Gmail：应该正常
   - Yahoo：显著改善
   - Outlook：保持良好

4. **定期检查**：
   - Mailgun控制台的投递统计
   - 用户反馈的邮件接收情况
   - DNS记录的有效性

---

**配置完成后，Yahoo邮件投递问题应该得到显著改善！**