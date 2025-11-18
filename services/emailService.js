const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// HTML转义函数，防止XSS攻击
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 邮件模板生成器
const EmailTemplates = {
  // 生成询价通知邮件模板
  quoteNotification: (quote) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>新的询价请求</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          border-left: 4px solid #007bff;
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
          color: #007bff;
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
          background-color: #007bff;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          font-weight: 500;
        }
        .action-button:hover {
          background-color: #0056b3;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔔 新的询价请求</h1>
        </div>
        
        <div class="content">
          <div class="info-box">
            <div class="info-row">
              <span class="info-label">询价号:</span>
              <span class="info-value quote-number">${escapeHtml(quote.quoteNumber)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">标题:</span>
              <span class="info-value">${escapeHtml(quote.title)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">描述:</span>
              <span class="info-value">${escapeHtml(quote.description) || '无'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">客户留言:</span>
              <span class="info-value">${escapeHtml(quote.customerMessage) || '无'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">创建时间:</span>
              <span class="info-value">${quote.createdAt.toLocaleString('zh-CN')}</span>
            </div>
          </div>
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || '#'}/quotes/${quote._id}" class="action-button">
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
  `,

  // 生成报价回复邮件模板
  quoteResponse: (quote) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>报价回复</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
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
          border-left: 4px solid #28a745;
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
          color: #007bff;
          font-weight: bold;
          font-size: 18px;
        }
        .price {
          color: #28a745;
          font-weight: bold;
          font-size: 20px;
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
          background-color: #28a745;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          font-weight: 500;
        }
        .action-button:hover {
          background-color: #218838;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ 报价回复</h1>
        </div>
        
        <div class="content">
          <div class="info-box">
            <div class="info-row">
              <span class="info-label">询价号:</span>
              <span class="info-value quote-number">${escapeHtml(quote.quoteNumber)}</span>
            </div>

            <div class="info-row">
              <span class="info-label">标题:</span>
              <span class="info-value">${escapeHtml(quote.title)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">报价:</span>
              <span class="info-value price">${quote.price ? `${quote.price} ${quote.currency}` : '待定'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">报价员留言:</span>
              <span class="info-value">${escapeHtml(quote.quoterMessage) || '无'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">有效期至:</span>
              <span class="info-value">${quote.validUntil ? quote.validUntil.toLocaleString('zh-CN') : '无限制'}</span>
            </div>
          </div>
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || '#'}/quotes/${quote._id}" class="action-button">
              查看报价详情
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
  `,

  // 生成密码重置邮件模板
  passwordReset: (resetUrl) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>密码重置</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
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
          background: linear-gradient(135deg, #dc3545 0%, #fd7e14 100%);
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
        .alert {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 0 5px 5px 0;
        }
        .footer {
          background-color: #f8f9fa;
          padding: 20px;
          text-align: center;
          border-top: 1px solid #e9ecef;
          color: #6c757d;
          font-size: 14px;
        }
        .reset-button {
          display: inline-block;
          background-color: #dc3545;
          color: white;
          padding: 15px 40px;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          font-weight: 500;
          font-size: 16px;
        }
        .reset-button:hover {
          background-color: #c82333;
        }
        .url-text {
          background-color: #f8f9fa;
          padding: 10px;
          border-radius: 5px;
          word-break: break-all;
          font-family: monospace;
          font-size: 12px;
          color: #6c757d;
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
            <a href="${resetUrl}" class="reset-button">重置密码</a>
          </p>
          
          <div class="alert">
            <strong>⚠️ 重要提醒：</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>此链接将在 <strong>1小时</strong> 后过期</li>
              <li>如果您没有请求重置密码，请忽略此邮件</li>
              <li>为了账户安全，请不要将此链接分享给他人</li>
            </ul>
          </div>
          
          <p>如果按钮无法点击，请复制以下地址到浏览器地址栏：</p>
          <div class="url-text">${resetUrl}</div>
        </div>
        
        <div class="footer">
          <p>此邮件由询价系统自动发送，请勿回复。</p>
          <p>如有疑问，请联系系统管理员。</p>
        </div>
      </div>
    </body>
    </html>
  `
};

// Create transporter
const transporter = nodemailer.createTransport({
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
});

// Send quote notification to quoters
const sendQuoteNotification = async (quoterEmail, quote) => {
  try {
    const startTime = Date.now();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: quoterEmail,
      subject: `新的询价请求 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.quoteNotification(quote),
      attachments: quote.customerFile && quote.customerFile.path ? [{
        filename: quote.customerFile.originalName,
        path: quote.customerFile.path,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }] : []
    };

    const result = await transporter.sendMail(mailOptions);
    const endTime = Date.now();
    
    // 记录邮件发送日志
    logger.email('发送', quoterEmail, quote.quoteNumber, true, null);
    
    return result;
  } catch (error) {
    logger.email('发送', quoterEmail, quote.quoteNumber, false, error);
    throw new Error(`邮件发送失败: ${error.message}`);
  }
};

// Send quote response to customer
const sendQuoteResponse = async (customerEmail, quote) => {
  try {
    const startTime = Date.now();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: customerEmail,
      subject: `报价回复 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.quoteResponse(quote),
      attachments: quote.quoterFile && quote.quoterFile.path ? [{
        filename: quote.quoterFile.originalName,
        path: quote.quoterFile.path,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }] : []
    };

    const result = await transporter.sendMail(mailOptions);
    const endTime = Date.now();
    
    // 记录邮件发送日志
    logger.email('发送', quoterEmail, quote.quoteNumber, true, null);
    
    return result;
  } catch (error) {
    logger.email('发送', quoterEmail, quote.quoteNumber, false, error);
    throw new Error(`邮件发送失败: ${error.message}`);
  }
};

// Send password reset email
const sendPasswordReset = async (email, resetToken) => {
  try {
    const startTime = Date.now();
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: '密码重置请求',
      html: EmailTemplates.passwordReset(resetUrl)
    };

    const result = await transporter.sendMail(mailOptions);
    const endTime = Date.now();
    
    // 记录邮件发送日志
    logger.info('密码重置邮件发送成功', {
      to: email,
      messageId: result.messageId,
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

module.exports = {
  sendQuoteNotification,
  sendQuoteResponse,
  sendPasswordReset
};