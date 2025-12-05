const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/User');

async function testAPI() {
  try {
    await mongoose.connect('mongodb://localhost:27017/quoteonline');
    
    // 获取管理员用户
    const admin = await User.findOne({ email: 'administrator@quote.com' });
    if (!admin) {
      console.log('管理员用户不存在');
      return;
    }
    
    // 创建测试JWT令牌
    const token = jwt.sign(
      { userId: admin._id, role: admin.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
    
    console.log('测试令牌已创建');
    console.log('管理员:', admin.email, '角色:', admin.role);
    
    // 测试API端点
    console.log('\n请使用以下令牌测试API:');
    console.log('Authorization: Bearer', token);
    
    // API端点:
    console.log('\n测试端点:');
    console.log('GET http://localhost:3000/api/users/suppliers');
    console.log('GET http://localhost:3000/api/groups');
    
  } catch (error) {
    console.error('测试失败:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

testAPI();