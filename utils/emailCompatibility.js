// 邮件兼容性工具 - 针对腾讯企业邮箱等特殊邮箱服务
const emailCompatibilityUtils = {
  // HTML转义
  escapeHtml: (text) => {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  // 生成兼容的CSS样式
  getCompatibleStyles: () => `
    <style>
      /* 基础重置样式 */
      body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
      body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
      
      /* 基础样式 */
      body {
        font-family: 'Microsoft YaHei', 'SimHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif !important;
        line-height: 1.6;
        color: #333333;
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
        background-color: #f4f4f4;
      }
      
      /* 容器样式 - 使用table确保兼容性 */
      .container {
        background-color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        overflow: hidden;
        max-width: 600px;
        margin: 0 auto;
      }
      
      /* 头部样式 */
      .header {
        background-color: #667eea !important;
        color: white !important;
        padding: 30px 20px;
        text-align: center;
      }
      
      .header h1 {
        margin: 0 !important;
        font-size: 24px !important;
        font-weight: 300 !important;
        font-family: 'Microsoft YaHei', 'SimHei', 'Segoe UI', sans-serif !important;
      }
      
      /* 内容区域 */
      .content {
        padding: 30px 20px;
      }
      
      /* 信息框样式 */
      .info-box {
        background-color: #f8f9fa !important;
        border: 1px solid #e9ecef !important;
        border-radius: 6px;
        padding: 20px;
        margin: 20px 0;
      }
      
      .info-row {
        display: block;
        margin: 10px 0;
        clear: both;
      }
      
      .info-label {
        font-weight: bold !important;
        color: #495057 !important;
        display: inline-block;
        min-width: 120px;
        font-family: 'Microsoft YaHei', 'SimHei', sans-serif !important;
      }
      
      .info-value {
        color: #212529 !important;
        display: inline-block;
        word-break: break-word;
        font-family: 'Microsoft YaHei', 'SimHei', sans-serif !important;
      }
      
      .quote-number {
        color: #007bff !important;
        font-weight: bold !important;
        font-size: 18px !important;
      }
      
      /* 按钮样式 - 兼容性优化 */
      .action-button {
        display: inline-block !important;
        background-color: #007bff !important;
        color: white !important;
        padding: 12px 30px !important;
        text-decoration: none !important;
        border-radius: 5px;
        margin: 20px 0;
        font-weight: 500 !important;
        font-size: 16px !important;
        text-align: center;
        border: 2px solid #007bff;
        font-family: 'Microsoft YaHei', 'SimHei', sans-serif !important;
      }
      
      /* 底部样式 */
      .footer {
        background-color: #f8f9fa !important;
        padding: 20px;
        text-align: center;
        border-top: 1px solid #e9ecef;
        color: #6c757d !important;
        font-size: 14px !important;
        font-family: 'Microsoft YaHei', 'SimHei', sans-serif !important;
      }
      
      /* 针对腾讯企业邮箱的特殊样式 */
      @media screen and (max-width: 600px) {
        body { padding: 10px !important; }
        .container { max-width: 100% !important; }
        .content { padding: 20px 15px !important; }
        .action-button { width: 100% !important; }
      }
    </style>
  `,

  // 生成兼容的邮件头部
  getCompatibleHeader: () => `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
  `,

  // 生成兼容的HTML结构
  getCompatibleWrapper: (content) => `
    <!DOCTYPE html>
    <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
      ${emailCompatibilityUtils.getCompatibleHeader()}
      ${emailCompatibilityUtils.getCompatibleStyles()}
    </head>
    <body>
      <div class="container">
        ${content}
      </div>
    </body>
    </html>
  `
};

module.exports = emailCompatibilityUtils;