require('dotenv').config();
const { sendQuoterAssignmentNotification } = require('./services/mailgunService');

console.log('🔍 Mailgun配置检查');

// 检查环境变量
const apiKey = process.env.MAILGUN_API_KEY;
const domain = process.env.MAILGUN_DOMAIN;

if (!apiKey || apiKey === 'YOUR_MAILGUN_API_KEY_HERE') {
  console.error('❌ 请先在.env文件中设置正确的MAILGUN_API_KEY');
  process.exit(1);
}

if (!domain) {
  console.error('❌ 请在.env文件中设置MAILGUN_DOMAIN');
  process.exit(1);
}

console.log('✅ 环境变量配置正确');
console.log(`📋 Domain: ${domain}`);
console.log(`🔑 API Key: ${apiKey.substring(0, 10)}...`);

// 创建测试询价单对象
const testQuote = {
  _id: 'test-quote-id',
  quoteNumber: 'Q25120899',
  title: 'Mailgun测试询价单',
  description: '这是一个用于测试Mailgun邮件发送的询价单',
  createdAt: new Date(),
  customerFiles: []
};

// 测试邮箱列表
const testEmails = [
  process.env.TEST_EMAIL || 'your-email@example.com',
  'test-puresource@gmail.com',
  'supplier123456@yahoo.com'
];

async function testMailgunSending() {
  console.log('\n📧 开始测试Mailgun邮件发送...');
  
  for (const email of testEmails) {
    try {
      console.log(`\n🚀 发送测试邮件到: ${email}`);
      
      await sendQuoterAssignmentNotification(email, testQuote);
      
      console.log(`✅ 邮件发送成功到: ${email}`);
      
      // 添加延迟避免发送过快
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ 发送到 ${email} 失败:`, error.message);
    }
  }
  
  console.log('\n📊 测试完成！');
  console.log('💡 提示：');
  console.log('1. 检查收件箱（包括垃圾箱）');
  console.log('2. 登录Mailgun控制台查看发送状态');
  console.log('3. Yahoo邮件可能需要几分钟才能收到');
}

// 运行测试
testMailgunSending().catch(console.error);