const jwt = require('jsonwebtoken');

// 模拟当前配置生成tokens
const userId = 'test';
const role = 'customer';

// 当前配置 (从utils/tokenUtils.js)
const accessToken = jwt.sign({ userId, role }, 'hollyheaven', { expiresIn: '30m' });
const refreshToken = jwt.sign({ userId, role }, 'evilhell', { expiresIn: '3d' });

console.log('📋 当前Token配置分析:');
console.log('================================');

const accessPayload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64'));
const refreshPayload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64'));

console.log('Access Token:');
console.log('  过期时间:', new Date(accessPayload.exp * 1000).toLocaleString());
console.log('  有效期:', (accessPayload.exp - accessPayload.iat) / 60, '分钟');

console.log('\nRefresh Token:');
console.log('  过期时间:', new Date(refreshPayload.exp * 1000).toLocaleString());
console.log('  有效期:', (refreshPayload.exp - refreshPayload.iat) / 3600, '小时');

const refreshHours = (refreshPayload.exp - refreshPayload.iat) / 3600;
console.log('\n🚨 问题诊断:');
if (refreshHours > 24) {
  console.log('❌ Refresh Token有效期过长:', Math.round(refreshHours), '小时');
  console.log('💡 建议缩短到8-24小时');
  console.log('🔍 这是导致用户长时间保持登录的根本原因');
}

console.log('\n🎯 解决方案:');
console.log('1. 修改utils/tokenUtils.js中refreshToken过期时间为8小时');
console.log('2. 在前端添加用户活动检测');
console.log('3. 实现真正的用户无活动超时机制');