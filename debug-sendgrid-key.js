require('dotenv').config();
const sgMail = require('@sendgrid/mail');

console.log('🔍 SendGrid API Key 调试工具');
console.log('=================================');

const apiKey = process.env.SENDGRID_API_KEY;

if (!apiKey) {
  console.log('❌ SENDGRID_API_KEY 环境变量未设置');
  process.exit(1);
}

console.log('📋 API Key 信息:');
console.log(`长度: ${apiKey.length}`);
console.log(`前缀: ${apiKey.substring(0, 3)}...`);
console.log(`格式正确: ${apiKey.startsWith('SG.') ? '✅' : '❌'}`);

// 验证API Key格式
if (!apiKey.startsWith('SG.')) {
  console.log('❌ SendGrid API Key应该以 "SG." 开头');
  console.log('   请检查API Key是否正确复制');
}

if (apiKey.length !== 69) {
  console.log('⚠️ SendGrid API Key长度通常为69个字符');
  console.log(`   当前长度: ${apiKey.length}`);
}

console.log('\n🔗 常见问题检查:');
console.log('1. API Key是否从SendGrid控制台正确复制？');
console.log('2. API Key是否已激活（状态为Active）？');
console.log('3. API Key是否有发送邮件的权限？');
console.log('4. 是否有足够的发送配额？');

// 尝试简单的API验证
console.log('\n🧪 测试API连接...');
sgMail.setApiKey(apiKey);

// 这是一个简单的验证请求
sgMail.request({
  method: 'GET',
  url: '/v3/scopes'
}).then(() => {
  console.log('✅ API Key验证成功');
}).catch((error) => {
  if (error.response) {
    console.log('❌ API Key验证失败:');
    console.log(JSON.stringify(error.response.body, null, 2));
  } else {
    console.log('❌ 网络错误:', error.message);
  }
});