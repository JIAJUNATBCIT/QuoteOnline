/**
 * 详细客户群管理逻辑测试脚本
 * 专门验证"Customer1和Customer2在同一群组后，只看得到对方加入群组后创建的询价单"
 * 运行方式：node scripts/testDetailedCustomerGroupLogic.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const CustomerGroup = require('../models/CustomerGroup');
const Quote = require('../models/Quote');
const PermissionUtils = require('../utils/permissionUtils');
require('dotenv').config();

async function testDetailedCustomerGroupLogic() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27091/quote_online');
    console.log('已连接到数据库');

    // 清理之前的测试数据
    await cleanupTestData();

    // === 测试场景1：Customer1先加入，Customer2后加入 ===
    console.log('\n=== 测试场景1：Customer1先加入，Customer2后加入 ===');
    
    // 创建客户群组
    const customerGroup = new CustomerGroup({
      name: '详细测试客户群组',
      description: '用于详细测试客户群管理逻辑',
      createdBy: await getAdminUserId()
    });
    await customerGroup.save();
    console.log(`创建客户群组: ${customerGroup.name}`);

    // 创建Customer1（2024-01-01加入）
    const customer1 = new User({
      name: '测试客户1',
      email: 'detailed_customer1@test.com',
      password: 'password123',
      role: 'customer',
      customerGroups: [customerGroup._id],
      customerGroupMembership: [{
        customerGroup: customerGroup._id,
        joinedAt: new Date('2024-01-01'),
        isActive: true
      }]
    });
    await customer1.save();

    // Customer1创建询价单（2024-01-10）
    const quote1 = new Quote({
      quoteNumber: `DETAILED_TEST_${Date.now()}_1`,
      customer: customer1._id,
      title: 'Customer1在2024-01-10创建的询价单',
      description: '此时Customer2还未加入群组',
      customerGroups: [customerGroup._id],
      createdAt: new Date('2024-01-10'),
      status: 'pending'
    });
    await quote1.save();
    console.log('Customer1创建询价单（2024-01-10）');

    // 创建Customer2（2024-01-15加入）
    const customer2 = new User({
      name: '测试客户2',
      email: 'detailed_customer2@test.com',
      password: 'password123',
      role: 'customer',
      customerGroups: [customerGroup._id],
      customerGroupMembership: [{
        customerGroup: customerGroup._id,
        joinedAt: new Date('2024-01-15'),
        isActive: true
      }]
    });
    await customer2.save();
    console.log('Customer2加入群组（2024-01-15）');

    // Customer2创建询价单（2024-01-20）
    const quote2 = new Quote({
      quoteNumber: `DETAILED_TEST_${Date.now()}_2`,
      customer: customer2._id,
      title: 'Customer2在2024-01-20创建的询价单',
      description: '此时Customer2已经在群组中',
      customerGroups: [customerGroup._id],
      createdAt: new Date('2024-01-20'),
      status: 'pending'
    });
    await quote2.save();
    console.log('Customer2创建询价单（2024-01-20）');

    // 获取用户完整信息
    const customer1WithMembership = await User.findById(customer1._id).populate('customerGroupMembership.customerGroup');
    const customer2WithMembership = await User.findById(customer2._id).populate('customerGroupMembership.customerGroup');

    // 验证权限
    console.log('\n--- 权限验证 ---');
    
    // Customer1的权限
    const customer1CanSeeQuote1 = await PermissionUtils.canCustomerViewQuote(quote1, { userId: customer1._id, role: 'customer' }, customer1WithMembership);
    const customer1CanSeeQuote2 = await PermissionUtils.canCustomerViewQuote(quote2, { userId: customer1._id, role: 'customer' }, customer1WithMembership);
    
    console.log(`Customer1能看到自己的询价单（2024-01-10创建）: ${customer1CanSeeQuote1}`);
    console.log(`Customer1能看到Customer2的询价单（2024-01-20创建）: ${customer1CanSeeQuote2}`);

    // Customer2的权限
    const customer2CanSeeQuote1 = await PermissionUtils.canCustomerViewQuote(quote1, { userId: customer2._id, role: 'customer' }, customer2WithMembership);
    const customer2CanSeeQuote2 = await PermissionUtils.canCustomerViewQuote(quote2, { userId: customer2._id, role: 'customer' }, customer2WithMembership);
    
    console.log(`Customer2能看到Customer1的询价单（2024-01-10创建，Customer2加入前）: ${customer2CanSeeQuote1}`);
    console.log(`Customer2能看到自己的询价单（2024-01-20创建）: ${customer2CanSeeQuote2}`);

    // 验证结果
    console.log('\n--- 结果验证 ---');
    const scenario1Success = 
      customer1CanSeeQuote1 === true &&  // Customer1能看到自己的询价单
      customer1CanSeeQuote2 === true &&  // Customer1能看到Customer2的询价单（Customer2加入后创建）
      customer2CanSeeQuote1 === false && // Customer2不能看到Customer1的询价单（Customer2加入前创建）
      customer2CanSeeQuote2 === true;   // Customer2能看到自己的询价单

    console.log(`场景1测试${scenario1Success ? '通过' : '失败'}`);

    if (!scenario1Success) {
      console.log('❌ 场景1测试失败：权限逻辑不符合预期');
      console.log('预期：Customer1可以看到两个询价单，Customer2只能看到第二个询价单');
    } else {
      console.log('✅ 场景1测试通过：权限逻辑正确');
    }

    // === 测试场景2：Customer2重新加入群组 ===
    console.log('\n=== 测试场景2：Customer2离开并重新加入群组 ===');
    
    // Customer2离开群组（2024-02-01）
    await CustomerGroup.findByIdAndUpdate(customerGroup._id, {
      $pull: { customers: customer2._id }
    });

    await User.findByIdAndUpdate(customer2._id, {
      $pull: { customerGroups: customerGroup._id },
      $set: {
        'customerGroupMembership.$[elem].isActive': false,
        'customerGroupMembership.$[elem].leftAt': new Date('2024-02-01')
      }
    }, {
      arrayFilters: [
        { 'elem.customerGroup': customerGroup._id, 'elem.isActive': true }
      ]
    });

    console.log('Customer2离开群组（2024-02-01）');

    // Customer2重新加入群组（2024-02-15）
    await User.findByIdAndUpdate(customer2._id, {
      $addToSet: { customerGroups: customerGroup._id },
      $push: {
        customerGroupMembership: {
          customerGroup: customerGroup._id,
          joinedAt: new Date('2024-02-15'),
          isActive: true
        }
      }
    });

    await CustomerGroup.findByIdAndUpdate(customerGroup._id, {
      $addToSet: { customers: customer2._id }
    });

    console.log('Customer2重新加入群组（2024-02-15）');

    // Customer2创建新询价单（2024-02-20）
    const quote3 = new Quote({
      quoteNumber: `DETAILED_TEST_${Date.now()}_3`,
      customer: customer2._id,
      title: 'Customer2重新加入后创建的询价单',
      description: 'Customer2在2024-02-20重新加入后创建',
      customerGroups: [customerGroup._id],
      createdAt: new Date('2024-02-20'),
      status: 'pending'
    });
    await quote3.save();
    console.log('Customer2重新加入后创建询价单（2024-02-20）');

    // 获取更新后的用户信息
    const customer2AfterRejoin = await User.findById(customer2._id).populate('customerGroupMembership.customerGroup');

    // 验证重新加入后的权限
    console.log('\n--- 重新加入后权限验证 ---');
    
    const customer2CanSeeQuote1AfterRejoin = await PermissionUtils.canCustomerViewQuote(quote1, { userId: customer2._id, role: 'customer' }, customer2AfterRejoin);
    const customer2CanSeeQuote2AfterRejoin = await PermissionUtils.canCustomerViewQuote(quote2, { userId: customer2._id, role: 'customer' }, customer2AfterRejoin);
    const customer2CanSeeQuote3AfterRejoin = await PermissionUtils.canCustomerViewQuote(quote3, { userId: customer2._id, role: 'customer' }, customer2AfterRejoin);

    console.log(`Customer2重新加入后能看到Customer1的询价单（2024-01-10）: ${customer2CanSeeQuote1AfterRejoin}`);
    console.log(`Customer2重新加入后能看到自己在第一次加入时创建的询价单（2024-01-20）: ${customer2CanSeeQuote2AfterRejoin}`);
    console.log(`Customer2重新加入后能看到自己重新加入后创建的询价单（2024-02-20）: ${customer2CanSeeQuote3AfterRejoin}`);

    const scenario2Success = 
      customer2CanSeeQuote1AfterRejoin === false && // 仍然看不到加入前的询价单
      customer2CanSeeQuote2AfterRejoin === false && // 第一次加入期间的询价单也看不到
      customer2CanSeeQuote3AfterRejoin === true;    // 只能看到重新加入后创建的询价单

    console.log(`场景2测试${scenario2Success ? '通过' : '失败'}`);

    if (!scenario2Success) {
      console.log('❌ 场景2测试失败：重新加入后的权限逻辑不符合预期');
      console.log('预期：Customer2只能看到重新加入后创建的询价单');
    } else {
      console.log('✅ 场景2测试通过：重新加入后的权限逻辑正确');
    }

    // 最终总结
    const allTestsPassed = scenario1Success && scenario2Success;
    console.log('\n=== 最终总结 ===');
    console.log(`所有测试${allTestsPassed ? '通过' : '失败'}`);

    if (allTestsPassed) {
      console.log('🎉 客户群管理逻辑验证成功！');
      console.log('✅ Customer1和Customer2在同一群组后，只看得到对方加入群组后创建的询价单');
      console.log('✅ 成员重新加入后，只能看到重新加入后创建的询价单');
    } else {
      console.log('❌ 仍有权限逻辑问题需要修复');
    }

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    await mongoose.connection.close();
    console.log('数据库连接已关闭');
  }
}

async function cleanupTestData() {
  try {
    await User.deleteMany({ email: { $in: ['detailed_customer1@test.com', 'detailed_customer2@test.com'] } });
    await CustomerGroup.deleteMany({ name: '详细测试客户群组' });
    await Quote.deleteMany({ quoteNumber: { $regex: '^DETAILED_TEST_' } });
    console.log('清理测试数据完成');
  } catch (error) {
    console.error('清理测试数据失败:', error.message);
  }
}

async function getAdminUserId() {
  const admin = await User.findOne({ role: 'admin' });
  return admin ? admin._id : new mongoose.Types.ObjectId();
}

// 如果直接运行此脚本
if (require.main === module) {
  testDetailedCustomerGroupLogic();
}

module.exports = testDetailedCustomerGroupLogic;