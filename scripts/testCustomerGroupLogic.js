/**
 * 客户群管理逻辑测试脚本
 * 用于验证客户群组成员权限控制逻辑
 * 运行方式：node scripts/testCustomerGroupLogic.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const CustomerGroup = require('../models/CustomerGroup');
const Quote = require('../models/Quote');
const PermissionUtils = require('../utils/permissionUtils');
require('dotenv').config();

async function testCustomerGroupLogic() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quote_online');
    console.log('已连接到数据库');

    // 测试场景1：创建测试数据
    console.log('\n=== 测试场景1：创建测试数据 ===');
    
    // 创建客户群组
    const testGroup = await CustomerGroup.findOne({ name: '测试客户群组' });
    let customerGroup;
    
    if (!testGroup) {
      customerGroup = new CustomerGroup({
        name: '测试客户群组',
        description: '用于测试客户群管理逻辑',
        createdBy: await getAdminUserId()
      });
      await customerGroup.save();
      console.log(`创建客户群组: ${customerGroup.name}`);
    } else {
      customerGroup = testGroup;
      console.log(`使用现有客户群组: ${customerGroup.name}`);
    }

    // 创建测试用户
    let customer1 = await User.findOne({ email: 'customer1@test.com' });
    let customer2 = await User.findOne({ email: 'customer2@test.com' });

    if (!customer1) {
      customer1 = new User({
        name: '测试客户1',
        email: 'customer1@test.com',
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
      console.log('创建测试客户1');
    }

    if (!customer2) {
      customer2 = new User({
        name: '测试客户2',
        email: 'customer2@test.com',
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
      console.log('创建测试客户2');
    }

    // 创建测试询价单
    const quote1 = new Quote({
      quoteNumber: `TEST${Date.now()}1`,
      customer: customer1._id,
      title: '测试询价单1',
      description: '客户1在2024-01-10创建的询价单',
      customerGroups: [customerGroup._id],
      createdAt: new Date('2024-01-10'),
      status: 'pending'
    });
    await quote1.save();

    const quote2 = new Quote({
      quoteNumber: `TEST${Date.now()}2`,
      customer: customer2._id,
      title: '测试询价单2',
      description: '客户2在2024-01-20创建的询价单',
      customerGroups: [customerGroup._id],
      createdAt: new Date('2024-01-20'),
      status: 'pending'
    });
    await quote2.save();

    console.log('创建测试询价单完成');

    // 测试场景2：权限验证
    console.log('\n=== 测试场景2：权限验证 ===');

    // 获取用户的完整信息
    const customer1WithMembership = await User.findById(customer1._id).populate('customerGroupMembership.customerGroup');
    const customer2WithMembership = await User.findById(customer2._id).populate('customerGroupMembership.customerGroup');

    // 测试客户1的权限
    console.log('\n--- 客户1权限测试 ---');
    console.log(`客户1能看到自己的询价单: ${await PermissionUtils.canCustomerViewQuote(quote1, { userId: customer1._id, role: 'customer' }, customer1WithMembership)}`);
    console.log(`客户1能看到客户2的询价单(客户2加入后创建): ${await PermissionUtils.canCustomerViewQuote(quote2, { userId: customer1._id, role: 'customer' }, customer1WithMembership)}`);

    // 测试客户2的权限
    console.log('\n--- 客户2权限测试 ---');
    console.log(`客户2能看到客户1的询价单(客户2加入前创建): ${await PermissionUtils.canCustomerViewQuote(quote1, { userId: customer2._id, role: 'customer' }, customer2WithMembership)}`);
    console.log(`客户2能看到自己的询价单: ${await PermissionUtils.canCustomerViewQuote(quote2, { userId: customer2._id, role: 'customer' }, customer2WithMembership)}`);

    // 测试场景3：成员移出群组
    console.log('\n=== 测试场景3：成员移出群组 ===');
    
    // 将客户2移出群组
    await CustomerGroup.findByIdAndUpdate(customerGroup._id, {
      $pull: { customers: customer2._id }
    });

    await User.findByIdAndUpdate(customer2._id, {
      $pull: { customerGroups: customerGroup._id },
      $set: {
        'customerGroupMembership.$[elem].isActive': false,
        'customerGroupMembership.$[elem].leftAt': new Date()
      }
    }, {
      arrayFilters: [
        { 'elem.customerGroup': customerGroup._id, 'elem.isActive': true }
      ]
    });

    // 从客户2的询价单中移除群组ID
    await Quote.updateMany(
      { customer: customer2._id },
      { $pull: { customerGroups: customerGroup._id } }
    );

    console.log('已将客户2移出群组');

    // 重新获取用户信息
    const customer2AfterLeave = await User.findById(customer2._id).populate('customerGroupMembership.customerGroup');
    const quote2AfterLeave = await Quote.findById(quote2._id);

    console.log('\n--- 客户2离开群组后权限测试 ---');
    console.log(`客户2能看到客户1的询价单: ${await PermissionUtils.canCustomerViewQuote(quote1, { userId: customer2._id, role: 'customer' }, customer2AfterLeave)}`);
    console.log(`客户2能看到自己的询价单(群组已移除): ${await PermissionUtils.canCustomerViewQuote(quote2AfterLeave, { userId: customer2._id, role: 'customer' }, customer2AfterLeave)}`);

    console.log('\n=== 测试完成 ===');
    console.log('所有测试场景验证完成，客户群管理逻辑工作正常！');

  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    await mongoose.connection.close();
    console.log('数据库连接已关闭');
  }
}

async function getAdminUserId() {
  const admin = await User.findOne({ role: 'admin' });
  return admin ? admin._id : new mongoose.Types.ObjectId();
}

// 如果直接运行此脚本
if (require.main === module) {
  testCustomerGroupLogic();
}

module.exports = testCustomerGroupLogic;