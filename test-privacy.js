// 测试客户隐私保护
const axios = require('axios');

// 配置
const BASE_URL = 'http://localhost:3000/api';

// 测试用户凭据
const CUSTOMER_CREDENTIALS = {
  email: 'customer@test.com',
  password: 'password123'
};

const QUOTER_CREDENTIALS = {
  email: 'quoter@test.com', 
  password: 'password123'
};

const ADMIN_CREDENTIALS = {
  email: 'admin@test.com',
  password: 'password123'
};

let customerToken, quoterToken, adminToken;
let testQuoteId;

// 获取JWT token
async function login(credentials) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, credentials);
    return response.data.token;
  } catch (error) {
    console.error('登录失败:', error.response?.data || error.message);
    throw error;
  }
}

// 获取询价单列表
async function getQuotes(token, role) {
  try {
    const response = await axios.get(`${BASE_URL}/quotes`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`\n=== ${role} 查看询价单列表 ===`);
    if (response.data.length > 0) {
      const quote = response.data[0];
      console.log('询价单示例:', {
        id: quote._id,
        quoteNumber: quote.quoteNumber,
        title: quote.title,
        customer: quote.customer ? 'VISIBLE' : 'HIDDEN',
        quoter: quote.quoter ? 'VISIBLE' : 'HIDDEN'
      });
      
      if (role === 'customer' && quote.quoter) {
        console.log('❌ 错误：客户不应该看到询价员信息');
        return false;
      }
      
      if (role === 'quoter' && quote.customer) {
        console.log('❌ 错误：报价员不应该看到客户信息');
        return false;
      }
      
      console.log('✅ 隐私保护正确');
      return quote._id;
    } else {
      console.log('没有询价单数据');
      return null;
    }
  } catch (error) {
    console.error('获取询价单失败:', error.response?.data || error.message);
    return false;
  }
}

// 获取询价单详情
async function getQuoteDetail(token, role, quoteId) {
  try {
    const response = await axios.get(`${BASE_URL}/quotes/${quoteId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`\n=== ${role} 查看询价单详情 ===`);
    const quote = response.data;
    console.log('询价单详情:', {
      id: quote._id,
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      customer: quote.customer ? 'VISIBLE' : 'HIDDEN',
      quoter: quote.quoter ? 'VISIBLE' : 'HIDDEN'
    });
    
    if (role === 'customer' && quote.quoter) {
      console.log('❌ 错误：客户不应该看到询价员信息');
      return false;
    }
    
    if (role === 'quoter' && quote.customer) {
      console.log('❌ 错误：报价员不应该看到客户信息');
      return false;
    }
    
    console.log('✅ 隐私保护正确');
    return true;
  } catch (error) {
    console.error('获取询价单详情失败:', error.response?.data || error.message);
    return false;
  }
}

// 主测试函数
async function runPrivacyTest() {
  console.log('🔒 开始客户隐私保护测试...\n');
  
  try {
    // 登录获取token
    console.log('1. 登录获取访问令牌...');
    customerToken = await login(CUSTOMER_CREDENTIALS);
    quoterToken = await login(QUOTER_CREDENTIALS);
    adminToken = await login(ADMIN_CREDENTIALS);
    console.log('✅ 所有用户登录成功');
    
    // 测试客户视角
    console.log('\n2. 测试客户视角...');
    testQuoteId = await getQuotes(customerToken, 'customer');
    if (testQuoteId) {
      await getQuoteDetail(customerToken, 'customer', testQuoteId);
    }
    
    // 测试报价员视角
    console.log('\n3. 测试报价员视角...');
    testQuoteId = await getQuotes(quoterToken, 'quoter');
    if (testQuoteId) {
      await getQuoteDetail(quoterToken, 'quoter', testQuoteId);
    }
    
    // 测试管理员视角（应该能看到所有信息）
    console.log('\n4. 测试管理员视角...');
    testQuoteId = await getQuotes(adminToken, 'admin');
    if (testQuoteId) {
      await getQuoteDetail(adminToken, 'admin', testQuoteId);
    }
    
    console.log('\n🎉 隐私保护测试完成！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
  }
}

// 运行测试
if (require.main === module) {
  runPrivacyTest();
}

module.exports = { runPrivacyTest };