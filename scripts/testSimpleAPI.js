const axios = require('axios');

async function testSimpleAPI() {
  console.log('=== 简单API测试 ===\n');
  
  try {
    // 测试基本连接
    console.log('🔗 测试服务器连接...');
    const response = await axios.get('http://localhost:3000/api/quotes', {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ 服务器连接正常');
    console.log('状态码:', response.status);
    
  } catch (error) {
    if (error.response) {
      console.log('❌ API响应状态码:', error.response.status);
      console.log('❌ 错误信息:', error.response.data);
      
      if (error.response.status === 401) {
        console.log('⚠️  需要认证令牌');
      }
    } else {
      console.log('❌ 网络错误:', error.message);
    }
  }
}

testSimpleAPI();