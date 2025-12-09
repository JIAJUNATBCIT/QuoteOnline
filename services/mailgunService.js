const formData = require('form-data');
const Mailgun = require('mailgun.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { escapeHtml: escape, getCompatibleWrapper } = require('../utils/emailCompatibility');

// 初始化Mailgun客户端
const mailgun = new Mailgun(formData);

// Helper function to create attachments for Mailgun
const createAttachments = (files) => {
  if (!files || files.length === 0) return [];
  
  return files.map(file => {
    if (file.path) {
      try {
        // 构建绝对路径
        let filePath = file.path;
        if (!path.isAbsolute(filePath)) {
          filePath = path.resolve(process.cwd(), filePath);
        }
        
        logger.info('检查附件文件', {
          originalPath: file.path,
          absolutePath: filePath,
          filename: file.originalName
        });
        
        // 检查文件是否存在
        if (fs.existsSync(filePath)) {
          return {
            data: fs.createReadStream(filePath),
            filename: file.originalName,
            contentType: file.mimetype || 'application/octet-stream'
          };
        } else {
          logger.error('附件文件不存在', { 
            filename: file.originalName,
            originalPath: file.path,
            absolutePath: filePath,
            cwd: process.cwd()
          });
          return null;
        }
      } catch (error) {
        logger.error('读取附件文件失败', { 
          error: error.message,
          filename: file.originalName,
          path: file.path,
          stack: error.stack
        });
        return null;
      }
    }
    return null;
  }).filter(Boolean);
};

// 创建Mailgun客户端实例
const createClient = () => {
  const DOMAIN = process.env.MAILGUN_DOMAIN;
  const API_KEY = process.env.MAILGUN_API_KEY;
  
  if (!API_KEY) {
    throw new Error('MAILGUN_API_KEY环境变量未设置');
  }
  
  return mailgun.client({username: 'api', key: API_KEY});
};


// Send password reset email
const sendPasswordReset = async (email, resetToken) => {
  try {
    const startTime = Date.now();
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const client = createClient();
    const DOMAIN = process.env.MAILGUN_DOMAIN;
    
    const messageData = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: '密码重置请求 - 询价系统',
      html: EmailTemplates.passwordReset(resetUrl)
    };

    const result = await client.messages.create(DOMAIN, messageData);
    const endTime = Date.now();
    
    logger.info('密码重置邮件发送成功', {
      to: email,
      messageId: result.id,
      duration: endTime - startTime
    });
    
    return result;
  } catch (error) {
    logger.error('发送密码重置邮件失败', {
      to: email,
      error: error.message
    });
    throw new Error(`密码重置邮件发送失败: ${error.message}`);
  }
};

// Send quote assignment notification to quoters
const sendQuoterAssignmentNotification = async (quoterEmail, quote) => {
  try {
    const startTime = Date.now();
    const client = createClient();
    const DOMAIN = process.env.MAILGUN_DOMAIN;
    
    const messageData = {
      from: process.env.EMAIL_FROM,
      to: quoterEmail,
      subject: `新的询价单需要分配供应商 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.quoterAssignmentNotification(quote)
    };

    // 添加附件
    const attachments = createAttachments(quote.customerFiles || []);
    if (attachments.length > 0) {
      messageData.attachment = attachments;
    }

    const result = await client.messages.create(DOMAIN, messageData);
    
    logger.email('发送', quoterEmail, quote.quoteNumber, true, null);
    
    return result;
  } catch (error) {
    logger.email('发送', quoterEmail, quote.quoteNumber, false, error);
    throw new Error(`报价员分配通知邮件发送失败: ${error.message}`);
  }
};



// 发送供应商确认报价邮件给报价员
const sendSupplierQuotedNotification = async (quoterEmail, quote) => {
  try {
    const startTime = Date.now();
    const client = createClient();
    const DOMAIN = process.env.MAILGUN_DOMAIN;
    
    const messageData = {
      from: process.env.EMAIL_FROM,
      to: quoterEmail,
      subject: `供应商已报价 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.supplierQuotedNotification(quote)
    };

    // 添加附件
    const attachments = createAttachments(quote.supplierFiles || []);
    if (attachments.length > 0) {
      messageData.attachment = attachments;
    }

    const result = await client.messages.create(DOMAIN, messageData);
    
    logger.email('发送', quoterEmail, quote.quoteNumber, true, null);
    
    return result;
  } catch (error) {
    logger.email('发送', quoterEmail, quote.quoteNumber, false, error);
    throw new Error(`供应商确认报价邮件发送失败: ${error.message}`);
  }
};

// 发送最终报价确认邮件给客户
const sendFinalQuoteNotification = async (customerEmail, quote) => {
  try {
    const startTime = Date.now();
    const client = createClient();
    const DOMAIN = process.env.MAILGUN_DOMAIN || 'mg.junbclistings.com';
    
    const messageData = {
      from: process.env.EMAIL_FROM || 'sales@junbclistings.com',
      to: customerEmail,
      subject: `最终报价已确认 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.finalQuoteNotification(quote)
    };

    // 添加附件
    const attachments = createAttachments(quote.quoterFiles);
    if (attachments.length > 0) {
      messageData.attachment = attachments;
    }

    const result = await client.messages.create(DOMAIN, messageData);
    const endTime = Date.now();
    
    logger.email('发送', customerEmail, quote.quoteNumber, true, null);
    
    return result;
  } catch (error) {
    logger.email('发送', customerEmail, quote.quoteNumber, false, error);
    throw new Error(`最终报价确认邮件发送失败: ${error.message}`);
  }
};

// 发送供应商群组询价通知邮件
const sendSupplierGroupNotification = async (supplierEmail, quote) => {
  try {
    const startTime = Date.now();
    const client = createClient();
    const DOMAIN = process.env.MAILGUN_DOMAIN;
    
    const messageData = {
      from: process.env.EMAIL_FROM,
      to: supplierEmail,
      subject: `新的询价请求 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.supplierGroupNotification(quote)
    };

    // 添加附件
    const attachments = createAttachments(quote.customerFiles || []);
    if (attachments.length > 0) {
      messageData.attachment = attachments;
    }

    const result = await client.messages.create(DOMAIN, messageData);
    const endTime = Date.now();
    
    logger.email('发送', supplierEmail, quote.quoteNumber, true, null);
    logger.info('供应商群组邮件发送成功', {
      to: supplierEmail,
      messageId: result.id,
      duration: endTime - startTime
    });
    
    return result;
  } catch (error) {
    logger.email('发送', supplierEmail, quote.quoteNumber, false, error);
    throw new Error(`供应商群组通知邮件发送失败: ${error.message}`);
  }
};

// 发送不予报价通知邮件给客户
const sendQuoteRejectionNotification = async (customerEmail, quote) => {
  try {
    const startTime = Date.now();
    const client = createClient();
    const DOMAIN = process.env.MAILGUN_DOMAIN;
    
    const messageData = {
      from: process.env.EMAIL_FROM,
      to: customerEmail,
      subject: `询价不予处理 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.quoteRejectionNotification(quote)
    };

        // 添加附件
    const attachments = createAttachments(quote.clientFiles || []);
    if (attachments.length > 0) {
      messageData.attachment = attachments;
    }

    const result = await client.messages.create(DOMAIN, messageData);
    const endTime = Date.now();
    
    logger.email('发送', customerEmail, quote.quoteNumber, true, null);
    logger.info('不予报价通知邮件发送成功', {
      to: customerEmail,
      messageId: result.id,
      duration: endTime - startTime
    });
    
    return result;
  } catch (error) {
    logger.email('发送', customerEmail, quote.quoteNumber, false, error);
    throw new Error(`不予报价通知邮件发送失败: ${error.message}`);
  }
};

// 邮件模板
const EmailTemplates = {
  quoterAssignmentNotification: (quote) => {
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>新的询价单需要分配供应商 - ${quote.quoteNumber}</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background-color: #667eea;
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 300;
          }
          .content {
            padding: 30px 20px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
          }
          .info-box h3 {
            margin-top: 0;
            color: #667eea;
          }
          .info-row {
            margin: 10px 0;
            display: flex;
            align-items: flex-start;
          }
          .info-label {
            font-weight: 600;
            color: #495057;
            min-width: 100px;
            margin-right: 10px;
          }
          .info-value {
            flex: 1;
            word-break: break-word;
          }
          .quote-number {
            color: #667eea;
            font-weight: bold;
            font-size: 18px;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
          }
          .action-button {
            display: inline-block;
            background-color: #667eea;
            color: white !important;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: 500;
            font-size: 16px;
            text-align: center;
            border: 2px solid #667eea;
          }
          .action-button:hover {
            background-color: #5a6fd8;
            border-color: #5a6fd8;
          }
        </style>
      </head>
      <body>
      <div class="container">
      <div class="header">
        <h1>📋 新的询价单需要处理</h1>
      </div>
      
      <div class="content">
        <p>有新的询价单需要您分配供应商进行报价，请及时处理。</p>
        
        <div class="info-box">
          <div class="info-row">
            <span class="info-label">询价号:</span>
            <span class="info-value quote-number">${escape(quote.quoteNumber)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">标题:</span>
            <span class="info-value">${escape(quote.title)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">描述:</span>
            <span class="info-value">${escape(quote.description) || '无'}</span>
          </div>

          <div class="info-row">
            <span class="info-label">询价文件:</span>
            <span class="info-value">${(quote.customerFiles && quote.customerFiles.length > 0) 
              ? quote.customerFiles.map(file => escape(file.originalName)).join(', ')
              : '无'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">创建时间:</span>
            <span class="info-value">${quote.createdAt.toLocaleString('zh-CN')}</span>
          </div>
        </div>
        
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || '#'}/quote-view/${quote._id}" class="action-button">
            分配供应商
          </a>
        </p>
      </div>
      
      <div class="footer">
        <p>此邮件由询价系统自动发送，请勿回复。</p>
        <p>如有疑问，请联系系统管理员。</p>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>
      </body>
      </html>
    `;
    
    return content;
  },
  passwordReset: (resetUrl) => {
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>密码重置</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background-color: #dc3545;
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 300;
          }
          .content {
            padding: 30px 20px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #dc3545;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
          }
          .info-row {
            margin: 10px 0;
            display: flex;
            align-items: flex-start;
          }
          .info-label {
            font-weight: 600;
            color: #495057;
            min-width: 100px;
            margin-right: 10px;
          }
          .info-value {
            flex: 1;
            word-break: break-word;
          }
          .quote-number {
            color: #dc3545;
            font-weight: bold;
            font-size: 18px;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
          }
          .action-button {
            display: inline-block;
            background-color: #dc3545;
            color: white !important;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: 500;
            font-size: 16px;
            text-align: center;
            border: 2px solid #dc3545;
          }
          .action-button:hover {
            background-color: #c82333;
            border-color: #c82333;
          }
        </style>
      </head>
      <body>
      <div class="container">
      <div class="header">
        <h1>🔒 密码重置</h1>
      </div>
      
      <div class="content">
        <p>您好！</p>
        <p>您请求重置密码，请点击下面的按钮进行密码重置：</p>
        
        <p style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" class="action-button" style="background-color: #dc3545 !important; border-color: #dc3545 !important;">
            重置密码
          </a>
        </p>
        
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 0 5px 5px 0;">
          <strong>⚠️ 重要提醒：</strong>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>此链接将在 <strong>1小时</strong> 后过期</li>
            <li>如果您没有请求重置密码，请忽略此邮件</li>
            <li>为了账户安全，请不要将此链接分享给他人</li>
          </ul>
        </div>
        
        <p>如果按钮无法点击，请复制以下地址到浏览器地址栏：</p>
        <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px; word-break: break-all; font-family: monospace; font-size: 12px; color: #6c757d;">
          ${resetUrl}
        </div>
      </div>
      
      <div class="footer">
        <p>此邮件由询价系统自动发送，请勿回复。</p>
        <p>如有疑问，请联系系统管理员。</p>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>
      </body>
      </html>
    `;
    
    return content;
  },
  supplierQuotedNotification: (quote) => {
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>供应商已报价 - ${quote.quoteNumber}</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background-color: #17a2b8;
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 300;
          }
          .content {
            padding: 30px 20px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #17a2b8;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
          }
          .info-box h3 {
            margin-top: 0;
            color: #17a2b8;
          }
          .info-row {
            margin: 10px 0;
            display: flex;
            align-items: flex-start;
          }
          .info-label {
            font-weight: 600;
            color: #495057;
            min-width: 100px;
            margin-right: 10px;
          }
          .info-value {
            flex: 1;
            word-break: break-word;
          }
          .quote-number {
            color: #17a2b8;
            font-weight: bold;
            font-size: 18px;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
          }
          .action-button {
            display: inline-block;
            background-color: #17a2b8;
            color: white !important;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: 500;
            font-size: 16px;
            text-align: center;
            border: 2px solid #17a2b8;
          }
          .action-button:hover {
            background-color: #138496;
            border-color: #138496;
          }
        </style>
      </head>
      <body>
      <div class="container">
      <div class="header">
        <h1>供应商已报价</h1>
      </div>
      
      <div class="content">
        <p>您好，</p>
        <p>供应商 <strong>${quote.supplier ? escape(quote.supplier.name) : ''}</strong> 已经确认报价，请查看并上传最终报价文件。</p>
        
        <div class="info-box">
          <h3>询价单信息</h3>
          <div class="info-row">
            <span class="info-label">询价号:</span>
            <span class="info-value quote-number">${escape(quote.quoteNumber)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">标题:</span>
            <span class="info-value">${escape(quote.title)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">供应商:</span>
            <span class="info-value">${quote.supplier ? escape(quote.supplier.name) : ''} (${quote.supplier ? escape(quote.supplier.email) : ''})</span>
          </div>
          <div class="info-row">
            <span class="info-label">报价文件:</span>
            <span class="info-value">${quote.supplierFiles && quote.supplierFiles.length > 0 
              ? quote.supplierFiles.map(file => escape(file.originalName)).join(', ')
              : '无'}</span>
          </div>
        </div>
        
        <p>请及时处理此询价单，上传最终报价文件给客户。</p>
        
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/quotes/${quote._id}" class="action-button">
            查看询价详情
          </a>
        </p>
      </div>
      
      <div class="footer">
        <p>此邮件由询价系统自动发送，请勿回复。</p>
      </div>
      </div>
      </div>
      </div>
      </div>
      </div>
      </body>
      </html>
    `;
    
    return content;
  },
  finalQuoteNotification: (quote) => {
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>最终报价已确认 - ${quote.quoteNumber}</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background-color: #6f42c1;
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 300;
          }
          .content {
            padding: 30px 20px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #6f42c1;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
          }
          .info-box h3 {
            margin-top: 0;
            color: #6f42c1;
          }
          .info-row {
            margin: 10px 0;
            display: flex;
            align-items: flex-start;
          }
          .info-label {
            font-weight: 600;
            color: #495057;
            min-width: 100px;
            margin-right: 10px;
          }
          .info-value {
            flex: 1;
            word-break: break-word;
          }
          .quote-number {
            color: #6f42c1;
            font-weight: bold;
            font-size: 18px;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
          }
          .action-button {
            display: inline-block;
            background-color: #6f42c1;
            color: white !important;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: 500;
            font-size: 16px;
            text-align: center;
            border: 2px solid #6f42c1;
          }
          .action-button:hover {
            background-color: #5a32a3;
            border-color: #5a32a3;
          }
        </style>
      </head>
      <body>
      <div class="container">
      <div class="header">
        <h1>最终报价已确认</h1>
      </div>
      
      <div class="content">
        <p>尊敬的客户，</p>
        <p>您的询价单 <strong>${escape(quote.quoteNumber)}</strong> 的最终报价已经确认完成。</p>
        
        <div class="info-box">
          <h3>询价单信息</h3>
          <div class="info-row">
            <span class="info-label">询价号:</span>
            <span class="info-value quote-number">${escape(quote.quoteNumber)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">标题:</span>
            <span class="info-value">${escape(quote.title)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">描述:</span>
            <span class="info-value">${escape(quote.description || '')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">报价员:</span>
            <span class="info-value">${quote.quoter && quote.quoter.name ? escape(quote.quoter.name) : '未分配'}${quote.quoter && quote.quoter.email ? ` (${escape(quote.quoter.email)})` : ''}</span>
          </div>
          <div class="info-row">
            <span class="info-label">最终报价文件:</span>
            <span class="info-value">${quote.quoterFiles && quote.quoterFiles.length > 0 
              ? quote.quoterFiles.map(file => escape(file.originalName)).join(', ')
              : '无'}</span>
          </div>
        </div>
        
        <p>您可以登录系统下载最终报价文件。</p>
        
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/quotes/${quote._id}" class="action-button">
            查看询价详情
          </a>
        </p>
      </div>
      
      <div class="footer">
        <p>此邮件由询价系统自动发送，请勿回复。</p>
        <p>如有疑问，请联系系统管理员。</p>
      </div>
      </div>
      </div>
      </body>
      </html>
    `;
    
    return content;
  },
  supplierGroupNotification: (quote) => {
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>新的询价请求 - ${quote.quoteNumber}</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background-color: #ff6b6b;
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 300;
          }
          .content {
            padding: 30px 20px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #ff6b6b;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
          }
          .info-box h3 {
            margin-top: 0;
            color: #ff6b6b;
          }
          .info-row {
            margin: 10px 0;
            display: flex;
            align-items: flex-start;
          }
          .info-label {
            font-weight: 600;
            color: #495057;
            min-width: 100px;
            margin-right: 10px;
          }
          .info-value {
            flex: 1;
            word-break: break-word;
          }
          .quote-number {
            color: #ff6b6b;
            font-weight: bold;
            font-size: 18px;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
          }
          .action-button {
            display: inline-block;
            background-color: #ff6b6b;
            color: white !important;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: 500;
            font-size: 16px;
            text-align: center;
            border: 2px solid #ff6b6b;
          }
          .action-button:hover {
            background-color: #ff5252;
            border-color: #ff5252;
          }
        </style>
      </head>
      <body>
      <div class="container">
      <div class="header">
        <h1>📋 新的询价请求</h1>
      </div>
      
      <div class="content">
        <p>您好，</p>
        <p>您有一个新的询价请求需要处理，请查看详细信息并进行报价。</p>
        
        <div class="info-box">
          <h3>询价单信息</h3>
          <div class="info-row">
            <span class="info-label">询价号:</span>
            <span class="info-value quote-number">${escape(quote.quoteNumber)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">标题:</span>
            <span class="info-value">${escape(quote.title)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">描述:</span>
            <span class="info-value">${escape(quote.description || '无')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">询价文件:</span>
            <span class="info-value">${(quote.customerFiles && quote.customerFiles.length > 0) 
              ? quote.customerFiles.map(file => escape(file.originalName)).join(', ')
              : '无'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">创建时间:</span>
            <span class="info-value">${quote.createdAt.toLocaleString('zh-CN')}</span>
          </div>
        </div>
        
        <p>请及时查看询价详情并上传您的报价文件。</p>
        
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/quote-view/${quote._id}" class="action-button">
            查看询价详情
          </a>
        </p>
      </div>
      
      <div class="footer">
        <p>此邮件由询价系统自动发送，请勿回复。</p>
        <p>如有疑问，请联系系统管理员。</p>
      </div>
      </div>
      </body>
      </html>
    `;
    
    return content;
  },
  quoteRejectionNotification: (quote) => {
    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>询价不予处理 - ${quote.quoteNumber}</title>
        <style>
          body {
            font-family: 'Microsoft YaHei', 'SimHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background-color: #dc3545;
            color: white;
            padding: 30px 20px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 300;
          }
          .content {
            padding: 30px 20px;
          }
          .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #dc3545;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
          }
          .info-box h3 {
            margin-top: 0;
            color: #dc3545;
          }
          .info-row {
            margin: 10px 0;
            display: flex;
            align-items: flex-start;
          }
          .info-label {
            font-weight: 600;
            color: #495057;
            min-width: 100px;
            margin-right: 10px;
          }
          .info-value {
            flex: 1;
            word-break: break-word;
          }
          .quote-number {
            color: #dc3545;
            font-weight: bold;
            font-size: 18px;
          }
          .reject-reason {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
          }
          .reject-reason h4 {
            margin-top: 0;
            color: #856404;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
          }
          .action-button {
            display: inline-block;
            background-color: #6c757d;
            color: white !important;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
            font-weight: 500;
            font-size: 16px;
            text-align: center;
            border: 2px solid #6c757d;
          }
          .action-button:hover {
            background-color: #5a6268;
            border-color: #5a6268;
          }
        </style>
      </head>
      <body>
      <div class="container">
      <div class="header">
        <h1>❌ 询价不予处理</h1>
      </div>
      
      <div class="content">
        <p>尊敬的客户，</p>
        <p>很遗憾地通知您，您的询价单 <strong>${escape(quote.quoteNumber)}</strong> 经过评估后决定不予报价。</p>
        
        <div class="info-box">
          <h3>询价单信息</h3>
          <div class="info-row">
            <span class="info-label">询价号:</span>
            <span class="info-value quote-number">${escape(quote.quoteNumber)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">标题:</span>
            <span class="info-value">${escape(quote.title)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">描述:</span>
            <span class="info-value">${escape(quote.description || '')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">处理人员:</span>
            <span class="info-value">${quote.quoter && quote.quoter.name ? escape(quote.quoter.name) : '系统'}</span>
          </div>
        </div>
        
        <div class="reject-reason">
          <h4>📝 不予报价理由：</h4>
          <p>${escape(quote.rejectReason || '暂无具体说明')}</p>
        </div>
        
        <p>如果您对此决定有任何疑问，或者需要进一步的说明，请随时联系我们。</p>
        
        <p style="text-align: center; margin: 30px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/quotes/${quote._id}" class="action-button">
            查看询价详情
          </a>
        </p>
      </div>
      
      <div class="footer">
        <p>此邮件由询价系统自动发送，请勿回复。</p>
        <p>如有疑问，请联系系统管理员。</p>
      </div>
      </div>
      </body>
      </html>
    `;
    
    return content;
  }
};

module.exports = {
  sendPasswordReset,
  sendQuoterAssignmentNotification,
  sendSupplierQuotedNotification,
  sendFinalQuoteNotification,
  sendSupplierGroupNotification,
  sendQuoteRejectionNotification
};