require('dotenv').config(); // 加载环境变量
const sgMail = require('@sendgrid/mail');

// 设置API Key (需要替换为实际的API Key)
const apiKey = process.env.SENDGRID_API_KEY || 'YOUR_SENDGRID_API_KEY_HERE';

console.log('🔍 检查环境变量:');
console.log('SENDGRID_API_KEY:', apiKey ? `${apiKey.substring(0, 10)}...` : '未设置');

if (apiKey === 'YOUR_SENDGRID_API_KEY_HERE') {
  console.error('❌ 请先在.env文件中设置正确的SENDGRID_API_KEY');
  process.exit(1);
}

sgMail.setApiKey(apiKey);

async function testSendGrid() {
  try {
    console.log('📧 测试SendGrid邮件发送...');
    
    const msg = {
      to: process.env.TEST_EMAIL || 'your-email@example.com', // 替换为测试邮箱
      from: process.env.EMAIL_FROM || 'sales@junbclistings.com',
      subject: 'SendGrid测试邮件 - 询价系统',
      html: `
        <h2>🎉 SendGrid配置成功!</h2>
        <p>这封邮件是从询价系统通过SendGrid API发送的测试邮件。</p>
        <p>如果您收到这封邮件，说明SendGrid配置正确，可以正常发送邮件。</p>
        <hr>
        <p><small>发送时间: ${new Date().toLocaleString('zh-CN')}</small></p>
      `
    };

    const result = await sgMail.send(msg);
    console.log('✅ 邮件发送成功!');
    console.log('📋 Message ID:', result[0]?.headers?.['x-message-id']);
    console.log('📧 收件人:', msg.to);
    
  } catch (error) {
    console.error('❌ 邮件发送失败:', error.message);
    if (error.response) {
      console.error('📋 SendGrid错误详情:', JSON.stringify(error.response.body, null, 2));
    }
  }
}

// 运行测试
testSendGrid();