#!/usr/bin/env node

/**
 * 测试双token过期机制
 * 用于验证用户长时间不活动后是否会被要求重新登录
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 配置
const API_BASE = 'https://portal.ooishipping.com/api';
const TEST_RESULTS_FILE = './token-expiry-test-results.json';

// 测试用户凭据
const TEST_USER = {
  email: 'test@example.com',
  password: 'test123456'
};

// 测试结果
let testResults = {
  startTime: new Date().toISOString(),
  tests: [],
  summary: {}
};

/**
 * 记录测试结果
 */
function logTestResult(testName, success, details, error = null) {
  const result = {
    testName,
    timestamp: new Date().toISOString(),
    success,
    details,
    error: error ? error.message : null
  };
  
  testResults.tests.push(result);
  
  console.log(`\n[${new Date().toLocaleTimeString()}] ${testName}: ${success ? '✅ PASS' : '❌ FAIL'}`);
  if (details) console.log(`详情: ${details}`);
  if (error) console.log(`错误: ${error.message}`);
}

/**
 * 获取当前时间戳用于调试
 */
function getTimeInfo() {
  return {
    currentTime: new Date().toISOString(),
    timestamp: Date.now()
  };
}

/**
 * 用户登录获取tokens
 */
async function login() {
  try {
    const response = await axios.post(`${API_BASE}/auth/login`, TEST_USER);
    return {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken
    };
  } catch (error) {
    console.error('登录失败:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 验证token有效性
 */
async function validateToken(token) {
  try {
    // 解码JWT获取过期时间
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return {
      valid: true,
      exp: payload.exp * 1000, // 转换为毫秒
      iat: payload.iat * 1000,
      currentTime: Date.now(),
      timeToExpiry: payload.exp * 1000 - Date.now()
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * 测试API访问
 */
async function testApiAccess(accessToken) {
  try {
    const response = await axios.get(`${API_BASE}/users`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message,
      status: error.response?.status
    };
  }
}

/**
 * 测试token刷新
 */
async function testTokenRefresh(refreshToken) {
  try {
    const response = await axios.post(`${API_BASE}/auth/refresh`, {}, {
      headers: { 
        'Authorization': `Bearer ${refreshToken}`,
        'X-Skip-Interceptor': 'true'
      }
    });
    return {
      success: true,
      newAccessToken: response.data.accessToken,
      newRefreshToken: response.data.refreshToken
    };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status
    };
  }
}

/**
 * 主测试函数
 */
async function runTokenExpiryTest() {
  console.log('🧪 开始双token过期机制测试...');
  console.log('=' .repeat(60));

  try {
    // 1. 登录获取tokens
    console.log('\n1. 测试用户登录...');
    const tokens = await login();
    logTestResult('用户登录', true, '成功获取访问令牌和刷新令牌');

    // 2. 分析token过期时间
    console.log('\n2. 分析token过期时间...');
    const accessInfo = validateToken(tokens.accessToken);
    const refreshInfo = validateToken(tokens.refreshToken);
    
    if (accessInfo.valid) {
      logTestResult('访问令牌解析', true, 
        `过期时间: ${new Date(accessInfo.exp).toLocaleString()}, 剩余时间: ${Math.round(accessInfo.timeToExpiry/1000/60)}分钟`);
    }
    
    if (refreshInfo.valid) {
      logTestResult('刷新令牌解析', true, 
        `过期时间: ${new Date(refreshInfo.exp).toLocaleString()}, 剩余时间: ${Math.round(refreshInfo.timeToExpiry/1000/60/60)}小时`);
    }

    // 3. 测试当前API访问
    console.log('\n3. 测试当前API访问...');
    const apiTest = await testApiAccess(tokens.accessToken);
    logTestResult('API访问测试', apiTest.success, 
      apiTest.success ? '成功访问API' : `访问失败: ${apiTest.error}`);

    // 4. 测试token刷新机制
    console.log('\n4. 测试token刷新机制...');
    const refreshTest = await testTokenRefresh(tokens.refreshToken);
    logTestResult('令牌刷新测试', refreshTest.success, 
      refreshTest.success ? '成功获取新的访问令牌' : `刷新失败: ${refreshTest.error}`);

    // 5. 如果刷新成功，测试新token的有效性
    if (refreshTest.success) {
      console.log('\n5. 测试新token的有效性...');
      const newTokenInfo = validateToken(refreshTest.newAccessToken);
      if (newTokenInfo.valid) {
        logTestResult('新令牌验证', true, 
          `新令牌过期时间: ${new Date(newTokenInfo.exp).toLocaleString()}`);
        
        const newApiTest = await testApiAccess(refreshTest.newAccessToken);
        logTestResult('新令牌API测试', newApiTest.success,
          newApiTest.success ? '新令牌API访问成功' : `新令牌API访问失败: ${newApiTest.error}`);
      }
    }

    // 6. 模拟过期的访问令牌
    console.log('\n6. 测试过期token处理...');
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
    const expiredTest = await testApiAccess(expiredToken);
    logTestResult('过期令牌测试', !expiredTest.success && expiredTest.status === 401, 
      '正确拒绝了过期令牌');

    // 7. 检查刷新令牌是否真的有3天有效期
    if (refreshInfo.valid) {
      const refreshHours = refreshInfo.timeToExpiry / 1000 / 60 / 60;
      logTestResult('刷新令牌有效期检查', refreshHours > 48, // 应该超过48小时
        `刷新令牌有效期为 ${Math.round(refreshHours)} 小时`);
    }

  } catch (error) {
    logTestResult('测试执行', false, '测试过程中发生未预期的错误', error);
  }

  // 生成测试总结
  console.log('\n' + '=' .repeat(60));
  console.log('📊 测试总结');
  console.log('=' .repeat(60));

  const totalTests = testResults.tests.length;
  const passedTests = testResults.tests.filter(t => t.success).length;
  const failedTests = totalTests - passedTests;

  testResults.summary = {
    totalTests,
    passedTests,
    failedTests,
    successRate: ((passedTests / totalTests) * 100).toFixed(2) + '%',
    endTime: new Date().toISOString()
  };

  console.log(`总测试数: ${totalTests}`);
  console.log(`通过测试: ${passedTests}`);
  console.log(`失败测试: ${failedTests}`);
  console.log(`成功率: ${testResults.summary.successRate}`);

  // 保存测试结果
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(testResults, null, 2));
  console.log(`\n📁 测试结果已保存到: ${TEST_RESULTS_FILE}`);

  // 诊断建议
  console.log('\n🔍 诊断建议:');
  console.log('-'.repeat(30));
  
  if (refreshInfo && refreshInfo.valid) {
    const refreshHours = refreshInfo.timeToExpiry / 1000 / 60 / 60;
    if (refreshHours > 48) {
      console.log('⚠️  刷新令牌有效期为3天，这可能导致用户长时间保持登录状态');
      console.log('💡 建议将刷新令牌有效期缩短到8-24小时');
    }
  }

  console.log('💡 检查前端是否正确实现了token过期检测');
  console.log('💡 检查用户长时间不活动时是否有自动登出机制');
  console.log('💡 建议添加用户活动监听，超过一定时间不活动自动登出');
}

// 运行测试
if (require.main === module) {
  runTokenExpiryTest().catch(console.error);
}

module.exports = { runTokenExpiryTest };