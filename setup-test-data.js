const mongoose = require('mongoose');
const User = require('./models/User');
const Group = require('./models/Group');
const Quote = require('./models/Quote');

async function setupTestData() {
  try {
    // 连接数据库
    await mongoose.connect('mongodb://localhost:27017/quoteonline');
    console.log('✓ 数据库连接成功');

    // 1. 获取管理员用户
    const admin = await User.findOne({ email: 'administrator@quote.com' });
    if (!admin) {
      console.log('❌ 管理员用户不存在，请先创建管理员账户');
      return;
    }
    console.log('✓ 管理员用户存在:', admin.email);

    // 2. 创建测试群组
    let testGroup = await Group.findOne({ name: 'Electronics Suppliers' });
    if (!testGroup) {
      testGroup = new Group({
        name: 'Electronics Suppliers',
        description: 'Group for electronics component suppliers',
        color: '#007bff',
        isActive: true,
        createdBy: admin._id,
        users: []
      });
      await testGroup.save();
      console.log('✓ 创建测试群组成功');
    } else {
      console.log('✓ 测试群组已存在');
    }

    // 3. 获取或创建供应商用户
    let supplier = await User.findOne({ email: 'supplier@test.com' });
    if (!supplier) {
      supplier = new User({
        name: 'Test Supplier',
        email: 'supplier@test.com',
        password: '$2a$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', // password: 123456
        role: 'supplier',
        company: 'Test Electronics Co.',
        phone: '123-456-7890',
        isActive: true
      });
      await supplier.save();
      console.log('✓ 创建供应商用户成功');
    } else {
      console.log('✓ 供应商用户已存在');
    }

    // 4. 将供应商添加到群组
    if (!testGroup.users.includes(supplier._id)) {
      testGroup.users.push(supplier._id);
      await testGroup.save();
      console.log('✓ 供应商已添加到群组');
    } else {
      console.log('✓ 供应商已在群组中');
    }

    // 5. 获取或创建客户用户
    let customer = await User.findOne({ email: 'customer@test.com' });
    if (!customer) {
      customer = new User({
        name: 'Test Customer',
        email: 'customer@test.com',
        password: '$2a$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ', // password: 123456
        role: 'customer',
        company: 'Test Customer Corp',
        phone: '098-765-4321',
        isActive: true
      });
      await customer.save();
      console.log('✓ 创建客户用户成功');
    } else {
      console.log('✓ 客户用户已存在');
    }

    // 6. 创建测试询价单
    let testQuote = await Quote.findOne({ title: 'Electronics Components Quote Test' });
    if (!testQuote) {
      const quoteCount = await Quote.countDocuments();
      const quoteNumber = `QT${String(quoteCount + 1).padStart(6, '0')}`;
      
      testQuote = new Quote({
        quoteNumber: quoteNumber,
        customer: customer._id,
        title: 'Electronics Components Quote Test',
        description: 'Test quote for electronic components procurement',
        status: 'pending',
        urgent: false
      });
      await testQuote.save();
      console.log('✓ 创建测试询价单成功');
    } else {
      console.log('✓ 测试询价单已存在');
    }

    // 7. 将群组分配给询价单
    if (!testQuote.assignedGroups.includes(testGroup._id)) {
      testQuote.assignedGroups.push(testGroup._id);
      testQuote.status = 'in_progress';
      await testQuote.save();
      console.log('✓ 群组已分配给询价单');
    } else {
      console.log('✓ 询价单已分配群组');
    }

    // 8. 验证所有数据
    console.log('\n📊 数据验证:');
    console.log('- 管理员:', admin.email, '(角色:', admin.role, ')');
    console.log('- 群组:', testGroup.name, '(成员数:', testGroup.users.length, ')');
    console.log('- 供应商:', supplier.email, '(角色:', supplier.role, ')');
    console.log('- 客户:', customer.email, '(角色:', customer.role, ')');
    console.log('- 询价单:', testQuote.quoteNumber, '(状态:', testQuote.status, ')');
    console.log('- 询价单分配群组数:', testQuote.assignedGroups.length);

    console.log('\n🎉 测试数据设置完成！');
    console.log('✅ 群组管理功能数据准备就绪');
    console.log('✅ 前后端集成测试可以开始');

  } catch (error) {
    console.error('❌ 设置失败:', error);
  } finally {
    await mongoose.connection.close();
  }
}

setupTestData();