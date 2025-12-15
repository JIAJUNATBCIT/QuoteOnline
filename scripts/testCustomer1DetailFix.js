const axios = require('axios');

async function testCustomer1DetailFix() {
  console.log('=== 测试Customer1详细页修复 ===\n');
  
  try {
    // 1. 使用管理员令牌获取Customer1创建的询价单ID
    console.log('🔍 获取Customer1创建的询价单...');
    
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
    
    const testQuote = customer1Quotes[0];
    console.log(`✅ 找到询价单: ${testQuote.quoteNumber} (ID: ${testQuote._id})`);
    
    // 2. 使用Customer1令牌测试详细页API
    console.log('\n🔐 使用Customer1令牌测试详细页API...');
    
    try {
      const detailResponse = await axios.get(`http://localhost:3000/api/quotes/${testQuote._id}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJDdXN0b21lcjEiLCJyb2xlIjoiY3VzdG9tZXIiLCJpYXQiOjE3MDQyNTAwMDB9.test-customer1-token'
        }
      });
      
      console.log('✅ 详细页API调用成功！');
      console.log('   状态码:', detailResponse.status);
      console.log(`   询价号: ${detailResponse.data.quoteNumber}`);
      console.log(`   客户: ${detailResponse.data.customer?.name}`);
      console.log(`   标题: ${detailResponse.data.title}`);
      
      // 检查是否包含customerGroups字段
      if (detailResponse.data.customerGroups) {
        console.log(`   客户群组数量: ${detailResponse.data.customerGroups.length}`);
        if (detailResponse.data.customerGroups.length > 0) {
          console.log('   客户群组:');
          detailResponse.data.customerGroups.forEach((group, index) => {
            console.log(`     ${index + 1}. ${group.name}`);
          });
        }
      } else {
        console.log('   客户群组: 无');
      }
      
      console.log('\n🎉 Customer1可以正常访问自己创建的询价单详细页！修复成功！');
      
    } catch (error) {
      if (error.response) {
        console.log('❌ API响应状态码:', error.response.status);
        console.log('❌ 错误信息:', error.response.data);
        
        if (error.response.status === 403) {
          console.log('\n⚠️  权限不足，需要进一步检查权限逻辑');
        } else if (error.response.status === 404) {
          console.log('\n⚠️  询价单不存在');
        } else if (error.response.status === 401) {
          console.log('\n⚠️  认证失败，需要有效令牌');
        } else if (error.response.status === 500) {
          console.log('\n⚠️  服务器内部错误，需要检查服务器日志');
        }
      } else {
        console.log('❌ 网络错误:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

testCustomer1DetailFix();