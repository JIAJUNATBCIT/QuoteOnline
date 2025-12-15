const mongoose = require('mongoose');
const Quote = require('../models/Quote');
const User = require('../models/User');
const PermissionUtils = require('../utils/permissionUtils');

async function debugCustomer1Detail() {
  console.log('=== 调试Customer1详细页问题 ===\n');
  
  try {
    // 连接数据库
    await mongoose.connect('mongodb://localhost:27017/quoteonline');
    console.log('✅ 数据库连接成功\n');
    
    // 1. 获取Customer1用户
    const customer1 = await User.findOne({ name: 'Customer1' });
    if (!customer1) {
      console.log('❌ Customer1用户不存在');
      return;
    }
    
    console.log('👤 Customer1信息:');
    console.log(`   用户ID: ${customer1._id}`);
    console.log(`   角色: ${customer1.role}`);
    console.log(`   客户群组: ${customer1.customerGroups?.length || 0}`);
    
    // 2. 获取Customer1创建的询价单
    const customer1Quotes = await Quote.find({ customer: customer1._id })
      .populate('customer', 'name email company')
      .populate('customerGroups', 'name description color');
    
    console.log(`\n📋 Customer1创建的询价单数量: ${customer1Quotes.length}`);
    
    if (customer1Quotes.length === 0) {
      console.log('❌ Customer1没有创建任何询价单');
      return;
    }
    
    const testQuote = customer1Quotes[0];
    console.log(`\n🔍 测试询价单: ${testQuote.quoteNumber} (ID: ${testQuote._id})`);
    
    // 3. 测试权限检查
    console.log('\n🔐 权限检查:');
    const canView = PermissionUtils.canCustomerViewQuote(testQuote, customer1);
    console.log(`   canCustomerViewQuote结果: ${canView}`);
    
    // 4. 检查询价单数据结构
    console.log('\n📊 询价单数据结构:');
    console.log(`   询价单ID: ${testQuote._id}`);
    console.log(`   客户ID: ${testQuote.customer._id}`);
    console.log(`   客户名称: ${testQuote.customer.name}`);
    console.log(`   询价单群组数量: ${testQuote.customerGroups?.length || 0}`);
    
    if (testQuote.customerGroups && testQuote.customerGroups.length > 0) {
      console.log('   询价单群组:');
      testQuote.customerGroups.forEach((group, index) => {
        console.log(`     ${index + 1}. ${group.name} (${group._id})`);
      });
    }
    
    // 5. 检查用户群组
    console.log('\n👥 用户群组信息:');
    const userCustomerGroupIds = customer1.customerGroups ? 
      customer1.customerGroups.map(id => id.toString()) : [];
    console.log(`   用户群组IDs: ${userCustomerGroupIds.join(', ') || '无'}`);
    
    // 6. 详细权限检查
    console.log('\n🔍 详细权限检查:');
    const userId = customer1._id.toString();
    const quoteCustomerId = testQuote.customer._id.toString();
    console.log(`   用户ID: ${userId}`);
    console.log(`   询价单客户ID: ${quoteCustomerId}`);
    console.log(`   是否是创建者: ${userId === quoteCustomerId}`);
    
    // 7. 检查群组交集
    if (testQuote.customerGroups && testQuote.customerGroups.length > 0 && userCustomerGroupIds.length > 0) {
      console.log('\n🔗 群组交集检查:');
      let hasIntersection = false;
      testQuote.customerGroups.forEach(group => {
        const groupId = group._id.toString();
        const inUserGroups = userCustomerGroupIds.includes(groupId);
        console.log(`   群组 ${group.name} (${groupId}): ${inUserGroups ? '✅ 有交集' : '❌ 无交集'}`);
        if (inUserGroups) hasIntersection = true;
      });
      console.log(`   群组交集结果: ${hasIntersection}`);
    }
    
    console.log('\n🎯 最终权限结果:');
    if (canView) {
      console.log('✅ Customer1可以访问自己创建的询价单详细页');
    } else {
      console.log('❌ Customer1无法访问自己创建的询价单详细页');
      console.log('   需要检查权限逻辑问题');
    }
    
  } catch (error) {
    console.error('❌ 调试失败:', error.message);
    console.error('错误堆栈:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 数据库连接已关闭');
  }
}

debugCustomer1Detail();