const axios = require('axios');

async function testCustomer1DetailAPI() {
  console.log('=== 测试Customer1查看自己创建的询价单详细页API ===\n');
  
  try {
    // 首先获取Customer1创建的询价单ID
    const listResponse = await axios.get('http://localhost:3000/api/quotes', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2N2QwYzY1YzQ0YzY1YzQ0YzY1YzQ0Iiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzA0MjUwMDAwfQ.test-admin-token'
      }
    });
    
    const customer1Quotes = listResponse.data.filter(quote => 
      quote.customer?.name === 'Customer1'
    );
    
    if (customer1Quotes.length === 0) {
      console.log('❌ 未找到Customer1创建的询价单');
      return;
    }
    
    const customer1Quote = customer1Quotes[0];
    console.log(`📋 找到Customer1创建的询价单: ${customer1Quote.quoteNumber} (ID: ${customer1Quote._id})`);
    
    // 现在使用Customer1的令牌测试详细页API
    console.log('\n🔍 测试详细页API:');
    
    try {
      const detailResponse = await axios.get(`http://localhost:3000/api/quotes/${customer1Quote._id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJDdXN0b21lcjEiLCJyb2xlIjoiY3VzdG9tZXIiLCJpYXQiOjE3MDQyNTAwMDB9.test-customer1-token'
        }
      });
      
      console.log('✅ API响应状态码:', detailResponse.status);
      console.log('✅ 询价单详情:');
      console.log(`   询价号: ${detailResponse.data.quoteNumber}`);
      console.log(`   客户: ${detailResponse.data.customer?.name}`);
      console.log(`   标题: ${detailResponse.data.title}`);
      console.log('\n🎉 Customer1可以正常访问自己创建的询价单详细页！');
      
    } catch (error) {
      if (error.response) {
        console.log('❌ API响应状态码:', error.response.status);
        console.log('❌ 错误信息:', error.response.data);
        
        if (error.response.status === 403) {
          console.log('\n⚠️  权限不足，需要检查权限逻辑');
        } else if (error.response.status === 404) {
          console.log('\n⚠️  询价单不存在');
        } else if (error.response.status === 401) {
          console.log('\n⚠️  认证失败，需要有效令牌');
        }
      } else {
        console.log('❌ 网络错误:', error.message);
      }
    }
    
    // 同时测试一个Customer1不能访问的询价单
    console.log('\n🔍 测试Customer1不能访问的询价单:');
    
    const otherQuotes = listResponse.data.filter(quote => 
      quote.customer?.name !== 'Customer1'
    );
    
    if (otherQuotes.length > 0) {
      const otherQuote = otherQuotes[0];
      console.log(`   测试询价单: ${otherQuote.quoteNumber} (客户: ${otherQuote.customer?.name})`);
      
      try {
        const forbiddenResponse = await axios.get(`http://localhost:3000/api/quotes/${otherQuote._id}`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJDdXN0b21lcjEiLCJyb2xlIjoiY3VzdG9tZXIiLCJpYXQiOjE3MDQyNTAwMDB9.test-customer1-token'
          }
        });
        
        console.log('⚠️  意外成功访问了不应该访问的询价单');
        
      } catch (error) {
        if (error.response && error.response.status === 403) {
          console.log('✅ 正确拒绝访问，权限控制生效');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

testCustomer1DetailAPI();