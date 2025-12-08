#!/usr/bin/env node

// 验证token过期修复效果
const axios = require('axios');

async function verifyTokenFix() {
  console.log('🧪 验证token过期修复效果...');
  
  try {
    // 1. 登录获取tokens
    const response = await axios.post('https://portal.ooishipping.com/api/auth/login', {
      email: 'test@example.com',
      password: 'test123456'
    });

    const refreshToken = response.data.refreshToken;
    const refreshPayload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64'));
    
    const refreshHours = (refreshPayload.exp - refreshPayload.iat) / 3600;
    
    if (refreshHours <= 24) {
      console.log('✅ Refresh Token有效期已修复');
      console.log(`   新有效期: ${Math.round(refreshHours)} 小时`);
    } else {
      console.log('❌ Refresh Token有效期仍然过长');
    }

    // 2. 测试用户活动检测（需要前端配合）
    console.log('\n📝 前端集成步骤:');
    console.log('1. 将user-activity.service.ts集成到应用中');
    console.log('2. 修改app.component.ts添加活动检测逻辑');
    console.log('3. 重新构建并部署前端应用');
    console.log('4. 测试30分钟无活动是否自动登出');

  } catch (error) {
    console.error('验证失败:', error.message);
  }
}

verifyTokenFix();
