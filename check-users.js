const mongoose = require('mongoose');
const User = require('./models/User');

async function checkUsers() {
  try {
    await mongoose.connect('mongodb://localhost:27017/quoteonline');
    
    const users = await User.find({ role: { $in: ['admin', 'quoter'] } }).select('email role name');
    console.log('管理员和报价员账户:');
    users.forEach(u => console.log(`- ${u.email} (${u.name}) - 角色: ${u.role}`));
    
  } catch (error) {
    console.error('查询失败:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

checkUsers();