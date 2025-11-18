# 日志系统使用指南

## 概述

系统使用专业的日志记录系统，所有日志都会写入 `logs/` 目录，而不是在控制台打印。

## 日志文件位置

- **每日日志**: `logs/YYYY-MM-DD.log` - 按日期分割的完整日志
- **错误日志**: `logs/error.log` - 所有错误级别的日志汇总

## 日志级别

- **ERROR**: 错误信息，系统异常
- **WARN**: 警告信息，潜在问题
- **INFO**: 一般信息，正常操作记录
- **DEBUG**: 调试信息，详细的执行过程

## 查看日志

### 使用 npm 脚本

```bash
# 查看今天的所有日志
npm run logs

# 查看今天的错误日志
npm run logs:error

# 实时监控今天的日志
npm run logs:tail
```

### 直接使用脚本

```bash
# 查看今天的所有日志
node scripts/view-logs.js

# 查看指定日期的日志
node scripts/view-logs.js 2025-11-17

# 只查看错误日志
node scripts/view-logs.js --error

# 实时监控日志
node scripts/view-logs.js --tail

# 查看帮助信息
node scripts/view-logs.js --help
```

## 日志格式

每条日志记录包含以下信息：
```
[时间戳] [级别] 消息内容 | 附加信息(JSON格式)
```

示例：
```
[2025-11-18T06:42:13.967Z] [INFO] 创建询价单响应完成: Q-20251118-001 | {"totalTime":"245ms"}
[2025-11-18T06:42:13.967Z] [ERROR] 邮件发送失败 | {"to":"user@example.com","quoteNumber":"Q-20251118-001","error":"Connection timeout"}
```

## 日志内容

### 系统日志
- 服务器启动/关闭
- 数据库连接状态
- 未捕获的异常

### 请求日志
- HTTP 请求开始和结束
- 请求处理时间
- 用户信息（如果有）
- 错误信息（如果失败）

### 业务日志
- 询价单创建/更新/删除
- 邮件发送状态
- 数据库操作记录

### 邮件日志
- 邮件发送成功/失败
- 收件人信息
- 询价单号
- 错误详情

## 日志清理

系统会自动清理 30 天前的日志文件，保留 `error.log` 文件。

## 在代码中使用日志

```javascript
const logger = require('../utils/logger');

// 基本用法
logger.info('操作完成');
logger.error('发生错误', { error: err.message });
logger.warn('警告信息');
logger.debug('调试信息');

// 专用方法
logger.request(req, duration, error); // 记录HTTP请求
logger.email('发送', to, quoteNumber, success, error); // 记录邮件操作
logger.database('查询', 'quotes', query, duration); // 记录数据库操作
```

## 故障排除

### 日志文件不存在
- 检查 `logs/` 目录权限
- 确保应用程序有写入权限

### 日志文件过大
- 系统会自动清理旧日志
- 可以手动删除不需要的日志文件

### 实时监控不工作
- 确保日志文件路径正确
- 检查文件系统权限

## 最佳实践

1. **使用合适的日志级别**
   - ERROR: 系统错误，需要立即处理
   - WARN: 警告信息，可能影响功能
   - INFO: 重要的业务操作
   - DEBUG: 详细的调试信息

2. **包含上下文信息**
   - 用户ID、请求ID等标识
   - 操作对象的关键信息
   - 错误的详细堆栈信息

3. **避免敏感信息**
   - 不要记录密码、密钥等敏感数据
   - 对用户数据进行适当脱敏

4. **定期检查日志**
   - 监控错误日志，及时发现问题
   - 分析性能日志，优化系统响应时间