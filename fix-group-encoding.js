const mongoose = require('mongoose');
const Group = require('./models/Group');
const User = require('./models/User');

async function fixGroupEncoding() {
  try {
    await mongoose.connect('mongodb://localhost:27017/quoteonline');
    
    // 获取管理员用户
    const admin = await User.findOne({ email: 'administrator@quote.com' });
    if (!admin) {
      console.log('管理员用户不存在');
      return;
    }
    
    // 删除有编码问题的群组
    await Group.deleteMany({ name: /\?{4,}/ });
    console.log('已删除有编码问题的群组');
    
    // 创建正确的中文群组
    const electronicsGroup = new Group({
      name: '电子元件供应商群组',
      description: '专门处理电子元件询价的供应商群组',
      color: '#007bff',
      isActive: true,
      createdBy: admin._id,
      users: []
    });
    
    await electronicsGroup.save();
    console.log('已创建中文电子元件供应商群组');
    
    // 再创建一个英文群组用于对比
    const generalGroup = new Group({
      name: 'General Suppliers',
      description: 'General purpose supplier group',
      color: '#28a745',
      isActive: true,
      createdBy: admin._id,
      users: []
    });
    
    await generalGroup.save();
    console.log('已创建英文General Suppliers群组');
    
    // 验证群组数据
    const groups = await Group.find({}).populate('createdBy', 'name email');
    console.log('\n当前群组列表:');
    groups.forEach((group, index) => {
      console.log(`${index + 1}. ${group.name} - ${group.description}`);
    });
    
  } catch (error) {
    console.error('修复失败:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

fixGroupEncoding();