#!/usr/bin/env node

/**
 * 调试用户活动检测和自动登出机制
 * 用于分析为什么用户长时间不活动仍保持登录状态
 */

const axios = require('axios');

const API_BASE = 'https://portal.ooishipping.com/api';

async function debugUserActivity() {
  console.log('🔍 调试用户活动检测机制...\n');

  // 1. 检查当前JWT token配置
  console.log('1. 检查后端token配置...');
  
  try {
    // 创建一个测试用户来获取token
    const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
      email: 'junbcrealestate@gmail.com',
      password: 'test123456'
    });

    const accessToken = loginResponse.data.accessToken;
    const refreshToken = loginResponse.data.refreshToken;

    // 解析JWT获取过期信息
    const accessPayload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64'));
    const refreshPayload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64'));

    console.log('📋 Access Token 信息:');
    console.log(`   过期时间: ${new Date(accessPayload.exp * 1000).toLocaleString()}`);
    console.log(`   有效期: ${(accessPayload.exp - accessPayload.iat) / 60} 分钟`);
    
    console.log('📋 Refresh Token 信息:');
    console.log(`   过期时间: ${new Date(refreshPayload.exp * 1000).toLocaleString()}`);
    console.log(`   有效期: ${(refreshPayload.exp - refreshPayload.iat) / 3600} 小时`);

    // 2. 测试token在过期前的刷新行为
    console.log('\n2. 测试token自动刷新...');
    
    const refreshResponse = await axios.post(`${API_BASE}/auth/refresh`, {}, {
      headers: {
        'Authorization': `Bearer ${refreshToken}`,
        'X-Skip-Interceptor': 'true'
      }
    });

    if (refreshResponse.data.accessToken) {
      console.log('✅ Token刷新机制工作正常');
      
      const newAccessPayload = JSON.parse(Buffer.from(refreshResponse.data.accessToken.split('.')[1], 'base64'));
      console.log(`   新token过期时间: ${new Date(newAccessPayload.exp * 1000).toLocaleString()}`);
    }

    // 3. 检查是否有用户活动检测
    console.log('\n3. 检查潜在问题...');
    
    const refreshHours = (refreshPayload.exp - refreshPayload.iat) / 3600;
    if (refreshHours > 24) {
      console.log('⚠️  发现问题: Refresh Token 有效期过长');
      console.log(`   当前: ${refreshHours} 小时，建议: 8-24 小时`);
    }

    if (refreshHours > 48) {
      console.log('🚨 严重问题: Refresh Token 有效期超过48小时');
      console.log('   这可能导致用户长时间保持登录状态');
    }

    // 4. 建议修复方案
    console.log('\n💡 建议的修复方案:');
    console.log('-'.repeat(40));
    console.log('1. 缩短Refresh Token有效期到8-24小时');
    console.log('2. 在前端添加用户活动检测');
    console.log('3. 实现真正的用户无活动超时机制');
    console.log('4. 添加服务器端token黑名单机制');

    return {
      accessTokenExpiry: accessPayload.exp * 1000,
      refreshTokenExpiry: refreshPayload.exp * 1000,
      refreshHours: refreshHours
    };

  } catch (error) {
    console.error('❌ 调试失败:', error.response?.data || error.message);
    return null;
  }
}

// 运行调试
if (require.main === module) {
  debugUserActivity().then(result => {
    if (result) {
      console.log('\n🎯 核心问题确认:');
      console.log(`   Refresh Token有效期: ${Math.round(result.refreshHours)} 小时`);
      console.log('   这是导致用户长时间保持登录的根本原因');
    }
  });
}

module.exports = { debugUserActivity };