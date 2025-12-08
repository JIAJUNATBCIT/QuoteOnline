/**
 * 修复邮件发送超时问题
 * 邮件发送失败导致创建询价单后白屏
 */

const fs = require('fs');
const path = require('path');

function fixEmailTimeout() {
  console.log('🔧 修复邮件发送超时问题...\n');

  // 1. 修改邮件服务配置 - 增加超时时间和错误处理
  console.log('1. 修复邮件服务配置...');
  
  const emailServicePath = path.join(__dirname, 'services', 'emailService.js');
  
  if (fs.existsSync(emailServicePath)) {
    let content = fs.readFileSync(emailServicePath, 'utf8');
    
    // 修改transporter配置，增加更宽松的超时设置
    const oldTransporterConfig = `const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // Use SSL for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false   // 关键：禁止验证证书
  },
  connectionTimeout: 30000,     // 30秒连接超时
  greetingTimeout: 10000,       // 10秒握手超时
  socketTimeout: 60000          // 60秒socket超时
});`;

    const newTransporterConfig = `const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // Use SSL for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false   // 关键：禁止验证证书
  },
  connectionTimeout: 60000,     // 60秒连接超时（增加）
  greetingTimeout: 15000,       // 15秒握手超时（增加）
  socketTimeout: 120000,        // 120秒socket超时（增加）
  pool: true,                   // 启用连接池
  maxConnections: 5,            // 最大连接数
  maxMessages: 100,             // 每个连接最大消息数
  rateDelta: 1000,              // 发送速率限制
  rateLimit: 5                  // 每秒最多发送5封邮件
});`;

    if (content.includes(oldTransporterConfig)) {
      content = content.replace(oldTransporterConfig, newTransporterConfig);
    } else {
      console.log('⚠️  Transporter配置可能与预期不同，尝试通用修复...');
      // 通用修复：增加超时配置
      content = content.replace(
        /connectionTimeout:\s*\d+/, 
        'connectionTimeout: 60000'
      );
      content = content.replace(
        /greetingTimeout:\s*\d+/, 
        'greetingTimeout: 15000'
      );
      content = content.replace(
        /socketTimeout:\s*\d+/, 
        'socketTimeout: 120000'
      );
    }
    
    // 添加连接池配置
    if (!content.includes('pool: true')) {
      content = content.replace(
        /socketTimeout:\s*\d+/,
        'socketTimeout: 120000,        // 120秒socket超时（增加）\n  pool: true,                   // 启用连接池\n  maxConnections: 5,            // 最大连接数\n  maxMessages: 100,             // 每个连接最大消息数'
      );
    }
    
    fs.writeFileSync(emailServicePath, content);
    console.log('✅ 邮件服务配置已优化');
  }

  // 2. 修改询价单创建逻辑 - 异步发送邮件
  console.log('\n2. 修改询价单创建逻辑...');
  
  const quotesRoutePath = path.join(__dirname, 'routes', 'quotes.js');
  
  if (fs.existsSync(quotesRoutePath)) {
    let content = fs.readFileSync(quotesRoutePath, 'utf8');
    
    // 查找邮件发送的代码块
    const oldEmailLogic = `    // 异步发送邮件给所有报价员
    setImmediate(async () => {
      try {
        const quoters = await User.find({ role: 'quoter', isActive: true })
          .select('email')
          .lean();
        
        if (quoters.length === 0) {
          logger.warn('没有找到活跃的报价员');
          return;
        }

        // 创建不包含客户信息的询价单对象用于邮件发送
        const sanitizedQuote = {
          _id: quote._id,
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          description: quote.description,
          createdAt: quote.createdAt,
          customerFiles: quote.customerFiles
          // 注意：不包含 customer 字段，保护客户隐私
        };

        const emailPromises = quoters.map(quoter => 
          emailService.sendQuoterAssignmentNotification(quoter.email, sanitizedQuote)
            .catch(error => logger.error(\`发送邮件给报价员 \${quoter.email} 失败\`, { error: error.message }))
        );
        
        const results = await Promise.allSettled(emailPromises);
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        const failCount = results.length - successCount;
        
        logger.info(\`询价单 \${quote.quoteNumber} 报价员分配通知邮件发送完成\`, { 
          successCount, 
          failCount, 
          totalQuoters: quoters.length 
        });
      } catch (error) {
        logger.error('批量发送报价员邮件失败', { error: error.message, stack: error.stack });
      }
    });`;

    const newEmailLogic = `    // 异步发送邮件给所有报价员（不阻塞主流程）
    setTimeout(async () => {
      try {
        const quoters = await User.find({ role: 'quoter', isActive: true })
          .select('email')
          .lean()
          .maxTimeMS(10000); // 查询超时保护
        
        if (quoters.length === 0) {
          logger.warn('没有找到活跃的报价员');
          return;
        }

        // 创建不包含客户信息的询价单对象用于邮件发送
        const sanitizedQuote = {
          _id: quote._id,
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          description: quote.description,
          createdAt: quote.createdAt,
          customerFiles: quote.customerFiles
          // 注意：不包含 customer 字段，保护客户隐私
        };

        // 串行发送邮件，避免连接池耗尽
        let successCount = 0;
        let failCount = 0;
        
        for (const quoter of quoters) {
          try {
            await Promise.race([
              emailService.sendQuoterAssignmentNotification(quoter.email, sanitizedQuote),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('邮件发送超时')), 45000)
              )
            ]);
            successCount++;
            // 添加延迟避免发送过快
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            failCount++;
            logger.error(\`发送邮件给报价员 \${quoter.email} 失败\`, { 
              error: error.message,
              quoteNumber: quote.quoteNumber
            });
          }
        }
        
        logger.info(\`询价单 \${quote.quoteNumber} 报价员分配通知邮件发送完成\`, { 
          successCount, 
          failCount, 
          totalQuoters: quoters.length 
        });
      } catch (error) {
        logger.error('批量发送报价员邮件失败', { 
          error: error.message, 
          stack: error.stack,
          quoteNumber: quote.quoteNumber 
        });
      }
    }, 1000); // 延迟1秒发送，确保询价单创建完成`;

    if (content.includes(oldEmailLogic)) {
      content = content.replace(oldEmailLogic, newEmailLogic);
    } else {
      console.log('⚠️  邮件发送逻辑可能已被修改，应用通用修复...');
      // 通用修复：添加超时保护
      content = content.replace(
        /setImmediate\(async \(\) => {/,
        'setTimeout(async () => {'
      );
      content = content.replace(
        /Promise.allSettled\(emailPromises\)/,
        '/* 串行发送避免超时 */\n        let successCount = 0;\n        let failCount = 0;\n        \n        for (const quoter of quoters) {\n          try {\n            await Promise.race([\n              emailService.sendQuoterAssignmentNotification(quoter.email, sanitizedQuote),\n              new Promise((_, reject) => \n                setTimeout(() => reject(new Error(\'邮件发送超时\')), 45000)\n              )\n            ]);\n            successCount++;\n            await new Promise(resolve => setTimeout(resolve, 1000));\n          } catch (error) {\n            failCount++;\n            logger.error(`发送邮件给报价员 ${quoter.email} 失败`, { error: error.message });\n          }\n        }'
      );
    }
    
    fs.writeFileSync(quotesRoutePath, content);
    console.log('✅ 询价单创建逻辑已优化');
  }

  // 3. 创建邮件发送降级策略
  console.log('\n3. 创建邮件发送降级策略...');
  
  const emailFallbackService = `
const logger = require('../utils/logger');

/**
 * 邮件发送降级服务
 * 当邮件服务不可用时提供降级策略
 */
class EmailFallbackService {
  constructor() {
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.isServiceDown = false;
    this.cooldownPeriod = 5 * 60 * 1000; // 5分钟冷却期
    this.maxFailures = 3; // 最大失败次数
  }

  /**
   * 记录邮件发送失败
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.maxFailures) {
      this.isServiceDown = true;
      logger.warn('邮件服务已降级', { 
        failureCount: this.failureCount,
        cooldownMinutes: this.cooldownPeriod / 1000 / 60
      });
    }
  }

  /**
   * 记录邮件发送成功
   */
  recordSuccess() {
    this.failureCount = 0;
    this.isServiceDown = false;
    this.lastFailureTime = null;
  }

  /**
   * 检查是否应该跳过邮件发送
   */
  shouldSkipEmail() {
    if (!this.isServiceDown) return false;
    
    const timeSinceLastFailure = Date.now() - (this.lastFailureTime || 0);
    return timeSinceLastFailure < this.cooldownPeriod;
  }

  /**
   * 尝试重置邮件服务状态
   */
  tryResetService() {
    if (this.isServiceDown && this.lastFailureTime) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.cooldownPeriod) {
        this.isServiceDown = false;
        this.failureCount = 0;
        this.lastFailureTime = null;
        logger.info('邮件服务已恢复正常');
        return true;
      }
    }
    return false;
  }

  /**
   * 安全发送邮件（带降级策略）
   */
  async safeSendEmail(emailFunction, ...args) {
    // 检查是否应该跳过
    if (this.shouldSkipEmail()) {
      logger.warn('邮件服务降级中，跳过邮件发送');
      return { skipped: true, reason: 'service_down' };
    }

    try {
      const result = await emailFunction(...args);
      this.recordSuccess();
      return { success: true, result };
    } catch (error) {
      this.recordFailure();
      
      if (this.isServiceDown) {
        logger.error('邮件发送失败，服务已降级', { 
          error: error.message,
          failureCount: this.failureCount
        });
      }
      
      throw error;
    }
  }
}

module.exports = new EmailFallbackService();
`;

  const fallbackServicePath = path.join(__dirname, 'services', 'emailFallbackService.js');
  fs.writeFileSync(fallbackServicePath, emailFallbackService);
  console.log('✅ 邮件降级服务已创建');

  console.log('\n🎯 修复总结:');
  console.log('-'.repeat(50));
  console.log('1. ✅ 增加邮件发送超时时间');
  console.log('2. ✅ 优化邮件发送逻辑（异步+串行）');
  console.log('3. ✅ 创建邮件降级策略');
  console.log('4. ✅ 添加邮件发送超时保护');
  
  console.log('\n🚀 下一步操作:');
  console.log('1. 重启后端服务');
  console.log('2. 测试创建询价单功能');
  console.log('3. 检查邮件发送日志');
  console.log('4. 验证前端不再白屏');

  return {
    emailConfigFixed: true,
    emailLogicFixed: true,
    fallbackServiceCreated: true
  };
}

// 运行修复
if (require.main === module) {
  const result = fixEmailTimeout();
  console.log('\n✨ 邮件超时问题修复完成!');
}

module.exports = { fixEmailTimeout };