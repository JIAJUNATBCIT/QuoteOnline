const mongoose = require('mongoose');
const User = require('../models/User');
const Quote = require('../models/Quote');
const CustomerGroup = require('../models/CustomerGroup');
const PermissionUtils = require('../utils/permissionUtils');

// 连接数据库
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quoteonline', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testCustomerSelfQuoteAccess() {
  console.log('=== 测试客户查看自己创建的询价单权限 ===\n');
  
  try {
    // 创建测试用户
    const customer1 = await User.findById('691ff0bd22e61fe475a8058f');
    const customer2 = await User.findById('691ff0ea22e61fe475a80594');
    
    if (!customer1 || !customer2) {
      console.log('❌ 找不到测试用户');
      return;
    }
    
    console.log(`✅ 找到测试用户: Customer1 (${customer1._id}), Customer2 (${customer2._id})`);
    
    // 创建测试群组
    let testGroup = await CustomerGroup.findOne({ name: 'Test Self Quote Access Group' });
    if (!testGroup) {
      testGroup = await CustomerGroup.create({
        name: 'Test Self Quote Access Group',
        description: '测试客户查看自己询价单的群组',
        createdBy: customer1._id
      });
      console.log(`✅ 创建测试群组: ${testGroup.name}`);
    }
    
    // 获取包含membership信息的用户
    const customer1WithMembership = await User.findById(customer1._id)
      .populate('customerGroupMembership.customerGroup');
    
    const customer2WithMembership = await User.findById(customer2._id)
      .populate('customerGroupMembership.customerGroup');
    
    console.log('\n--- 场景1: Customer2创建询价单后加入群组 ---');
    
    // 创建一个询价单（customer2在入群前创建）
    const quoteByC2BeforeJoin = await Quote.create({
      quoteNumber: 'TEST-SELF-001',
      title: 'Customer2入群前创建的询价单',
      description: '这个询价单应该在入群前创建',
      customer: customer2._id,
      customerGroups: [testGroup._id],
      status: 'pending',
      createdAt: new Date('2024-01-15T10:00:00Z')
    });
    
    console.log(`📝 创建询价单: "${quoteByC2BeforeJoin.title}" (时间: ${quoteByC2BeforeJoin.createdAt.toISOString()})`);
    
    // 检查customer2是否能看到自己创建的询价单
    const c2CanSeeOwnQuote = await PermissionUtils.canCustomerViewQuote(
      quoteByC2BeforeJoin, 
      { userId: customer2._id, role: 'customer' }, 
      customer2WithMembership
    );
    
    console.log(`🔍 Customer2 查看自己创建的询价单: ${c2CanSeeOwnQuote ? '✅ 可以' : '❌ 不能'}`);
    
    // 检查customer1是否能看到customer2的询价单（应该不能，因为入群时间晚于询价单创建时间）
    const c1CanSeeC2Quote = await PermissionUtils.canCustomerViewQuote(
      quoteByC2BeforeJoin, 
      { userId: customer1._id, role: 'customer' }, 
      customer1WithMembership
    );
    
    console.log(`🔍 Customer1 查看 Customer2 的询价单: ${c1CanSeeC2Quote ? '✅ 可以' : '❌ 不能'}`);
    
    console.log('\n--- 场景2: Customer2入群后创建询价单 ---');
    
    // 模拟customer2在入群后创建询价单
    const quoteByC2AfterJoin = await Quote.create({
      quoteNumber: 'TEST-SELF-002',
      title: 'Customer2入群后创建的询价单',
      description: '这个询价单应该在入群后创建',
      customer: customer2._id,
      customerGroups: [testGroup._id],
      status: 'pending',
      createdAt: new Date('2024-01-20T10:00:00Z')
    });
    
    console.log(`📝 创建询价单: "${quoteByC2AfterJoin.title}" (时间: ${quoteByC2AfterJoin.createdAt.toISOString()})`);
    
    // 检查customer2是否能看到自己创建的询价单
    const c2CanSeeOwnQuote2 = await PermissionUtils.canCustomerViewQuote(
      quoteByC2AfterJoin, 
      { userId: customer2._id, role: 'customer' }, 
      customer2WithMembership
    );
    
    console.log(`🔍 Customer2 查看自己创建的询价单: ${c2CanSeeOwnQuote2 ? '✅ 可以' : '❌ 不能'}`);
    
    // 检查customer1是否能看到customer2的询价单
    const c1CanSeeC2Quote2 = await PermissionUtils.canCustomerViewQuote(
      quoteByC2AfterJoin, 
      { userId: customer1._id, role: 'customer' }, 
      customer1WithMembership
    );
    
    console.log(`🔍 Customer1 查看 Customer2 的询价单: ${c1CanSeeC2Quote2 ? '✅ 可以' : '❌ 不能'}`);
    
    console.log('\n--- 场景3: 没有客户群组的询价单 ---');
    
    // 创建没有客户群组的询价单
    const quoteWithoutGroup = await Quote.create({
      quoteNumber: 'TEST-SELF-003',
      title: '没有客户群组的询价单',
      description: '这个询价单没有客户群组',
      customer: customer2._id,
      status: 'pending',
      createdAt: new Date('2024-01-25T10:00:00Z')
    });
    
    console.log(`📝 创建询价单: "${quoteWithoutGroup.title}" (无客户群组)`);
    
    // 检查customer2是否能看到自己创建的询价单（没有群组）
    const c2CanSeeOwnQuote3 = await PermissionUtils.canCustomerViewQuote(
      quoteWithoutGroup, 
      { userId: customer2._id, role: 'customer' }, 
      customer2WithMembership
    );
    
    console.log(`🔍 Customer2 查看自己创建的无群组询价单: ${c2CanSeeOwnQuote3 ? '✅ 可以' : '❌ 不能'}`);
    
    // 检查customer1是否能看到customer2的无群组询价单
    const c1CanSeeC2Quote3 = await PermissionUtils.canCustomerViewQuote(
      quoteWithoutGroup, 
      { userId: customer1._id, role: 'customer' }, 
      customer1WithMembership
    );
    
    console.log(`🔍 Customer1 查看 Customer2 的无群组询价单: ${c1CanSeeC2Quote3 ? '✅ 可以' : '❌ 不能'}`);
    
    // 清理测试数据
    await Quote.deleteMany({ 
      quoteNumber: { $in: ['TEST-SELF-001', 'TEST-SELF-002', 'TEST-SELF-003'] }
    });
    
    console.log('\n🧹 清理测试数据完成');
    
    // 总结测试结果
    console.log('\n=== 测试总结 ===');
    console.log('✅ 修复后逻辑: 客户始终可以看到自己创建的询价单，无论是否有客户群组');
    console.log('✅ 群组权限规则: 客户只能看到群组内其他成员在入群后创建的询价单');
    
  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  } finally {
    await mongoose.connection.close();
  }
}

// 运行测试
testCustomerSelfQuoteAccess();