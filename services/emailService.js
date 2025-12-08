const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
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
          color: white !important;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          font-weight: 500;
          font-size: 16px;
          text-align: center;
          border: 2px solid #007bff;
        }
        .action-button:hover {
          background-color: #0056b3;
          border-color: #0056b3;
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
              <span class="info-label">询价文件:</span>
              <span class="info-value">${(quote.customerFiles && quote.customerFiles.length > 0) 
                ? quote.customerFiles.map(file => escapeHtml(file.originalName)).join(', ')
                : '无'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">创建时间:</span>
              <span class="info-value">${quote.createdAt.toLocaleString('zh-CN')}</span>
            </div>
          </div>
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || '#'}/quote-view/${quote._id}" class="action-button">
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
          background-color: #28a745;
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
          color: white !important;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          font-weight: 500;
          font-size: 16px;
          text-align: center;
          border: 2px solid #28a745;
        }
        .action-button:hover {
          background-color: #218838;
          border-color: #218838;
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
              <span class="info-value price">${quote.price ? `${quote.price} ${quote.currency}` : '已报价'}</span>
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
            <a href="${process.env.FRONTEND_URL || '#'}/quote-view/${quote._id}" class="action-button">
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

  // 生成报价员分配供应商邮件模板
  quoterAssignmentNotification: (quote) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>新的询价单 - 需要分配供应商</title>
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
          border: 1px solid #e9ecef;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        .info-row {
          display: flex;
          margin: 10px 0;
        }
        .info-label {
          font-weight: bold;
          color: #495057;
          min-width: 120px;
        }
        .info-value {
          color: #212529;
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
          color: white !important;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
          font-weight: 500;
          font-size: 16px;
          text-align: center;
          border: 2px solid #007bff;
        }
        .action-button:hover {
          background-color: #0056b3;
          border-color: #0056b3;
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
              <span class="info-label">询价文件:</span>
              <span class="info-value">${(quote.customerFiles && quote.customerFiles.length > 0) 
                ? quote.customerFiles.map(file => escapeHtml(file.originalName)).join(', ')
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
    </body>
    </html>
  `,

  // 生成供应商报价通知邮件模板
  supplierQuoteNotification: (quote) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>供应商报价通知</title>
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
          background-color: #28a745;
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
          padding: 15px;
          margin: 20px 0;
          border-radius: 0 4px 4px 0;
        }
        .info-item {
          margin: 10px 0;
          display: flex;
          align-items: center;
        }
        .info-label {
          font-weight: bold;
          color: #495057;
          min-width: 100px;
        }
        .info-value {
          color: #212529;
        }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          background-color: #28a745;
          color: white !important;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
          font-size: 16px;
          text-align: center;
          margin: 15px 5px;
          border: 2px solid #28a745;
        }
        .btn:hover {
          background-color: #218838;
          border-color: #218838;
        }
        .footer {
          background-color: #f8f9fa;
          padding: 20px;
          text-align: center;
          color: #6c757d;
          font-size: 14px;
        }
        .supplier-info {
          background-color: #e3f2fd;
          border-left: 4px solid #2196f3;
          padding: 15px;
          margin: 20px 0;
          border-radius: 0 4px 4px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📋 供应商报价通知</h1>
        </div>
        
        <div class="content">
          <p>您好！</p>
          <p>供应商已完成询价单的报价，请及时处理并上传最终报价文件。</p>
          
          <div class="info-box">
            <h3>📄 询价单信息</h3>
            <div class="info-item">
              <span class="info-label">询价单号:</span>
              <span class="info-value">${escapeHtml(quote.quoteNumber)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">询价标题:</span>
              <span class="info-value">${escapeHtml(quote.title)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">询价描述:</span>
              <span class="info-value">${escapeHtml(quote.description || '无')}</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前状态:</span>
              <span class="info-value">供应商已报价</span>
            </div>
          </div>
          
          ${quote.supplier ? `
          <div class="supplier-info">
            <h3>🏢 供应商信息</h3>
            <div class="info-item">
              <span class="info-label">供应商:</span>
              <span class="info-value">${escapeHtml(quote.supplier.name || '未知')}</span>
            </div>
            <div class="info-item">
              <span class="info-label">公司:</span>
              <span class="info-value">${escapeHtml(quote.supplier.company || '未知')}</span>
            </div>
            ${(quote.supplierFiles && quote.supplierFiles.length > 0) ? `
            <div class="info-item">
              <span class="info-label">报价文件:</span>
              <span class="info-value">${quote.supplierFiles.map(file => escapeHtml(file.originalName)).join(', ')}</span>
            </div>
            ` : ''}
          </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/quote-view/${quote._id}" class="btn">
              📝 查看详情
            </a>
          </div>
          
          <p style="color: #6c757d; font-size: 14px;">
            请登录系统查看供应商报价并上传最终报价文件。客户将在您完成最终报价后收到通知。
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
  `,

  // 生成供应商确认报价邮件模板（发送给报价员）
  supplierQuotedNotification: (quote) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>供应商已报价 - ${quote.quoteNumber}</title>
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
          background-color: #28a745;
          color: white;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 300;
        }
        .content {
          padding: 40px 30px;
        }
        .quote-info {
          background-color: #f8f9fa;
          border-left: 4px solid #28a745;
          padding: 20px;
          margin: 20px 0;
          border-radius: 0 4px 4px 0;
        }
        .btn {
          display: inline-block;
          padding: 12px 30px;
          background-color: #28a745;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          font-weight: 500;
          margin: 20px 0;
          transition: background-color 0.3s;
        }
        .btn:hover {
          background-color: #218838;
        }
        .footer {
          background-color: #f8f9fa;
          padding: 20px 30px;
          text-align: center;
          font-size: 14px;
          color: #6c757d;
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
          <p>供应商 <strong>${quote.supplier ? escapeHtml(quote.supplier.name) : ''}</strong> 已经确认报价，请查看并上传最终报价文件。</p>
          
          <div class="quote-info">
            <h3>询价单信息</h3>
            <p><strong>询价号:</strong> ${escapeHtml(quote.quoteNumber)}</p>
            <p><strong>标题:</strong> ${escapeHtml(quote.title)}</p>
            <p><strong>供应商:</strong> ${quote.supplier ? escapeHtml(quote.supplier.name) : ''} (${quote.supplier ? escapeHtml(quote.supplier.email) : ''})</p>
            <p><strong>报价文件:</strong> ${quote.supplierFiles && quote.supplierFiles.length > 0 
              ? quote.supplierFiles.map(file => escapeHtml(file.originalName)).join(', ')
              : '无'}</p>
          </div>
          
          <p>请及时处理此询价单，上传最终报价文件给客户。</p>
          
          <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/quotes/${quote._id}" class="btn">查看询价详情</a>
        </div>
        <div class="footer">
          <p>此邮件由询价系统自动发送，请勿回复。</p>
        </div>
      </div>
    </body>
    </html>
  `,

  // 生成最终报价确认邮件模板（发送给客户）
  finalQuoteNotification: (quote) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>最终报价已确认 - ${quote.quoteNumber}</title>
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
          background-color: #007bff;
          color: white;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 300;
        }
        .content {
          padding: 40px 30px;
        }
        .quote-info {
          background-color: #f8f9fa;
          border-left: 4px solid #007bff;
          padding: 20px;
          margin: 20px 0;
          border-radius: 0 4px 4px 0;
        }
        .btn {
          display: inline-block;
          padding: 12px 30px;
          background-color: #007bff;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          font-weight: 500;
          margin: 20px 0;
          transition: background-color 0.3s;
        }
        .btn:hover {
          background-color: #0056b3;
        }
        .footer {
          background-color: #f8f9fa;
          padding: 20px 30px;
          text-align: center;
          font-size: 14px;
          color: #6c757d;
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
          <p>您的询价单 <strong>${escapeHtml(quote.quoteNumber)}</strong> 的最终报价已经确认完成。</p>
          
          <div class="quote-info">
            <h3>询价单信息</h3>
            <p><strong>询价号:</strong> ${escapeHtml(quote.quoteNumber)}</p>
            <p><strong>标题:</strong> ${escapeHtml(quote.title)}</p>
            <p><strong>描述:</strong> ${escapeHtml(quote.description || '')}</p>
            <p><strong>报价员:</strong> ${quote.quoter && quote.quoter.name ? escapeHtml(quote.quoter.name) : '未分配'}${quote.quoter && quote.quoter.email ? ` (${escapeHtml(quote.quoter.email)})` : ''}</p>
            <p><strong>最终报价文件:</strong> ${quote.quoterFiles && quote.quoterFiles.length > 0 
              ? quote.quoterFiles.map(file => escapeHtml(file.originalName)).join(', ')
              : '无'}</p>
          </div>
          
          <p>您可以登录系统下载最终报价文件。</p>
          
          <a href="${process.env.FRONTEND_URL || 'http://localhost:4200'}/quotes/${quote._id}" class="btn">查看询价详情</a>
        </div>
        <div class="footer">
          <p>此邮件由询价系统自动发送，请勿回复。</p>
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
  connectionTimeout: 60000,     // 60秒连接超时（增加）
  greetingTimeout: 15000,       // 15秒握手超时（增加）
  socketTimeout: 120000,        // 120秒socket超时（增加）
  pool: true,                   // 启用连接池
  maxConnections: 5,            // 最大连接数
  maxMessages: 100,             // 每个连接最大消息数
  rateDelta: 1000,              // 发送速率限制
  rateLimit: 5                  // 每秒最多发送5封邮件
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
      attachments: (quote.customerFiles && quote.customerFiles.length > 0) ? (() => {
        try {
          const files = quote.customerFiles;
          const attachments = [];
          
          for (const file of files) {
            if (file.path) {
              // 尝试读取文件内容
              const fileContent = fs.readFileSync(file.path);
              
              logger.info('使用客户文件附件', { 
                originalName: file.originalName,
                fileSize: fileContent.length
              });
              
              attachments.push({
                filename: file.originalName,
                content: fileContent
              });
            }
          }
          
          logger.info('发送客户文件附件', { 
            fileCount: attachments.length
          });
          
          return attachments;
        } catch (error) {
          logger.error('读取客户文件失败', { 
            error: error.message 
          });
          return [];
        }
      })() : []
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
      attachments: (quote.quoterFiles && quote.quoterFiles.length > 0) ? (() => {
        try {
          const files = quote.quoterFiles;
          const attachments = [];
          
          for (const file of files) {
            if (file.path) {
              // 尝试读取文件内容
              const fileContent = fs.readFileSync(file.path);
              
              logger.info('使用报价员文件附件', { 
                originalName: file.originalName,
                fileSize: fileContent.length
              });
              
              attachments.push({
                filename: file.originalName,
                content: fileContent
              });
            }
          }
          
          logger.info('发送报价员文件附件', { 
            fileCount: attachments.length
          });
          
          return attachments;
        } catch (error) {
          logger.error('读取报价员文件失败', { 
            error: error.message 
          });
          return [];
        }
      })() : []
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
    
    console.log('发送密码重置邮件到:', email);
    console.log('重置链接:', resetUrl);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: '密码重置请求 - 询价系统',
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
    
    console.log('邮件发送成功, Message ID:', result.messageId);
    
    return result;
  } catch (error) {
    logger.error('发送密码重置邮件失败', {
      to: email,
      error: error.message
    });
    console.error('发送密码重置邮件失败:', error);
    throw new Error(`密码重置邮件发送失败: ${error.message}`);
  }
};

// Send quote assignment notification to quoters
const sendQuoterAssignmentNotification = async (quoterEmail, quote) => {
  try {
    const startTime = Date.now();
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: quoterEmail,
      subject: `新的询价单需要分配供应商 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.quoterAssignmentNotification(quote)
    };

    const result = await transporter.sendMail(mailOptions);
    
    logger.email('发送', quoterEmail, quote.quoteNumber, true, null);
    
    return result;
  } catch (error) {
    logger.email('发送', quoterEmail, quote.quoteNumber, false, error);
    throw new Error(`报价员分配通知邮件发送失败: ${error.message}`);
  }
};

// 发送供应商报价通知邮件给报价员
const sendSupplierQuoteNotification = async (quoterEmail, quote) => {
  const startTime = Date.now();
  
  try {
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
    
    const mailOptions = {
      from: `"询价系统" <${process.env.EMAIL_USER}>`,
      to: quoterEmail,
      subject: `供应商报价通知 - ${quote.quoteNumber}`,
      html: EmailTemplates.supplierQuoteNotification(quote)
    };

    const result = await transporter.sendMail(mailOptions);
    const endTime = Date.now();
    
    logger.info('供应商报价通知邮件发送成功', {
      to: quoterEmail,
      quoteNumber: quote.quoteNumber,
      messageId: result.messageId,
      duration: endTime - startTime
    });
    
    return result;
  } catch (error) {
    logger.error('发送供应商报价通知邮件失败', {
      to: quoterEmail,
      error: error.message
    });
    throw new Error(`供应商报价通知邮件发送失败: ${error.message}`);
  }
};

// 发送供应商确认报价邮件给报价员
const sendSupplierQuotedNotification = async (quoterEmail, quote) => {
  try {
    const startTime = Date.now();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: quoterEmail,
      subject: `供应商已报价 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.supplierQuotedNotification(quote)
    };

    const result = await transporter.sendMail(mailOptions);
    const endTime = Date.now();
    
    // 记录邮件发送日志
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
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: customerEmail,
      subject: `最终报价已确认 - ${quote.quoteNumber} - ${quote.title}`,
      html: EmailTemplates.finalQuoteNotification(quote),
      attachments: (quote.quoterFiles && quote.quoterFiles.length > 0) ? (() => {
        try {
          const files = quote.quoterFiles;
          const attachments = [];
          
          for (const file of files) {
            if (file.path) {
              // 尝试读取文件内容
              const fileContent = fs.readFileSync(file.path);
              
              logger.info('使用最终报价文件附件', { 
                originalName: file.originalName,
                fileSize: fileContent.length
              });
              
              attachments.push({
                filename: file.originalName,
                content: fileContent
              });
            }
          }
          
          return attachments;
        } catch (error) {
          logger.error('读取最终报价文件失败', { 
            error: error.message 
          });
          return [];
        }
      })() : []
    };

    const result = await transporter.sendMail(mailOptions);
    const endTime = Date.now();
    
    // 记录邮件发送日志
    logger.email('发送', customerEmail, quote.quoteNumber, true, null);
    
    return result;
  } catch (error) {
    logger.email('发送', customerEmail, quote.quoteNumber, false, error);
    throw new Error(`最终报价确认邮件发送失败: ${error.message}`);
  }
};

module.exports = {
  sendQuoteNotification,
  sendQuoteResponse,
  sendSupplierQuoteNotification,
  sendPasswordReset,
  sendQuoterAssignmentNotification,
  sendSupplierQuotedNotification,
  sendFinalQuoteNotification
};