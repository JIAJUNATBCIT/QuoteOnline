const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.production' });

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./models/User');
    const users = await User.find({}, 'email name role').limit(5);
    console.log('系统用户列表:');
    users.forEach(user => {
      console.log(`- ${user.email} (${user.name}) [${user.role}]`);
    });
    mongoose.connection.close();
  } catch (error) {
    console.error('查询用户失败:', error.message);
  }
}

checkUsers();