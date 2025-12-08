/**
 * 测试询价单列表API
 */

const axios = require('axios');

async function testQuotesAPI() {
  console.log('🧪 测试询价单列表API...\n');

  try {
    // 1. 先登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post('https://portal.ooishipping.com/api/auth/login', {
      email: 'junbcrealestate@gmail.com',
      password: 'test123456'
    });

    const token = loginResponse.data.accessToken;
    console.log('✅ 登录成功，获取到token');

    // 2. 测试询价单列表API
    console.log('\n2. 测试询价单列表API...');
    
    const apiResponse = await axios.get('https://portal.ooishipping.com/api/quotes', {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 10000
    });

    console.log('✅ API调用成功');
    console.log('📊 返回数据:', {
      status: apiResponse.status,
      dataLength: Array.isArray(apiResponse.data) ? apiResponse.data.length : 'Not an array',
      dataType: typeof apiResponse.data
    });

    if (Array.isArray(apiResponse.data)) {
      console.log('📋 询价单列表:');
      apiResponse.data.forEach((quote, index) => {
        console.log(`  ${index + 1}. ${quote.quoteNumber} - ${quote.title}`);
      });
    }

  } catch (error) {
    console.error('❌ API测试失败');
    
    if (error.response) {
      console.error('状态码:', error.response.status);
      console.error('错误信息:', error.response.data);
    } else if (error.request) {
      console.error('网络错误:', error.message);
    } else {
      console.error('其他错误:', error.message);
    }
  }
}

// 测试API健康状况
async function testAPIHealth() {
  console.log('\n🏥 测试API健康状况...');
  
  try {
    const response = await axios.get('https://portal.ooishipping.com/api/auth/verify', {
      timeout: 5000
    });
    
    console.log('✅ API服务器响应正常');
    console.log('状态码:', response.status);
  } catch (error) {
    console.error('❌ API服务器无响应');
    console.error('错误:', error.message);
  }
}

// 运行测试
async function runTests() {
  await testAPIHealth();
  await testQuotesAPI();
}

runTests();