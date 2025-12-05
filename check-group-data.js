const mongoose = require('mongoose');
const Group = require('./models/Group');
const User = require('./models/User');

async function checkGroupData() {
  try {
    await mongoose.connect('mongodb://localhost:27017/quoteonline');
    
    const groups = await Group.find({}).populate('createdBy', 'name email');
    
    console.log('群组数据检查:');
    groups.forEach((group, index) => {
      console.log(`\n群组 ${index + 1}:`);
      console.log('- ID:', group._id);
      console.log('- Name:', JSON.stringify(group.name)); // 显示转义字符
      console.log('- Description:', JSON.stringify(group.description));
      console.log('- Color:', group.color);
      console.log('- IsActive:', group.isActive);
      console.log('- Created By:', group.createdBy ? group.createdBy.name : 'Unknown');
      console.log('- Created At:', group.createdAt);
      console.log('- Users count:', group.users ? group.users.length : 0);
    });
    
  } catch (error) {
    console.error('检查失败:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

checkGroupData();