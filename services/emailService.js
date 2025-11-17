const nodemailer = require('nodemailer');

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
  }
});

// Send quote notification to quoters
const sendQuoteNotification = async (quoterEmail, quote) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: quoterEmail,
      subject: `新的询价请求 - ${quote.title}`,
      html: `
        <h2>新的询价请求</h2>
        <p><strong>客户:</strong> ${quote.customer.name} (${quote.customer.company})</p>
        <p><strong>标题:</strong> ${quote.title}</p>
        <p><strong>描述:</strong> ${quote.description || '无'}</p>
        <p><strong>客户留言:</strong> ${quote.customerMessage || '无'}</p>
        <p><strong>创建时间:</strong> ${quote.createdAt.toLocaleString('zh-CN')}</p>
        <p>请登录系统查看详情并处理此询价。</p>
        <hr>
        <p>此邮件由询价系统自动发送，请勿回复。</p>
      `,
      attachments: quote.customerFile ? [{
        filename: quote.customerFile.originalName,
        path: quote.customerFile.path
      }] : []
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('发送邮件失败:', error);
    throw error;
  }
};

// Send quote response to customer
const sendQuoteResponse = async (customerEmail, quote) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: customerEmail,
      subject: `报价回复 - ${quote.title}`,
      html: `
        <h2>报价回复</h2>
        <p><strong>报价员:</strong> ${quote.quoter.name}</p>
        <p><strong>标题:</strong> ${quote.title}</p>
        <p><strong>报价:</strong> ${quote.price ? `${quote.price} ${quote.currency}` : '待定'}</p>
        <p><strong>报价员留言:</strong> ${quote.quoterMessage || '无'}</p>
        <p><strong>有效期至:</strong> ${quote.validUntil ? quote.validUntil.toLocaleString('zh-CN') : '无限制'}</p>
        <p>请登录系统查看详情。</p>
        <hr>
        <p>此邮件由询价系统自动发送，请勿回复。</p>
      `,
      attachments: quote.quoterFile ? [{
        filename: quote.quoterFile.originalName,
        path: quote.quoterFile.path
      }] : []
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('发送邮件失败:', error);
    throw error;
  }
};

// Send password reset email
const sendPasswordReset = async (email, resetToken) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: '密码重置请求',
      html: `
        <h2>密码重置</h2>
        <p>您请求重置密码，请点击下面的链接：</p>
        <p><a href="${resetUrl}">重置密码</a></p>
        <p>如果链接无法点击，请复制以下地址到浏览器：</p>
        <p>${resetUrl}</p>
        <p>此链接将在1小时后过期。</p>
        <hr>
        <p>如果您没有请求重置密码，请忽略此邮件。</p>
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('发送密码重置邮件失败:', error);
    throw error;
  }
};

module.exports = {
  sendQuoteNotification,
  sendQuoteResponse,
  sendPasswordReset
};