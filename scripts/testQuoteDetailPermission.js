const mongoose = require('mongoose');
const Quote = require('../models/Quote');
const User = require('../models/User');
const CustomerGroup = require('../models/CustomerGroup');
const PermissionUtils = require('../utils/permissionUtils');

async function testQuoteDetailPermission() {
  console.log('=== 测试询价单详细页权限逻辑 ===\n');
  
  try {
    // 连接数据库
    await mongoose.connect('mongodb://localhost:27017/quoteonline', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ 数据库连接成功\n');
    
    // 获取Customer1用户
    const customer1 = await User.findOne({ name: 'Customer1' });
    if (!customer1) {
      console.log('❌ Customer1用户不存在');
      return;
    }
    
    console.log('👤 Customer1信息:');
    console.log(`   用户ID: ${customer1._id}`);
    console.log(`   客户群组数量: ${customer1.customerGroups?.length || 0}`);
    
    // 获取所有询价单
    const allQuotes = await Quote.find({})
      .populate('customer', 'name email company')
      .populate('customerGroups', 'name description color');
    
    console.log(`\n📋 系统中总询价单数量: ${allQuotes.length}`);
    
    // 测试权限检查
    console.log('\n🔍 权限检查结果:');
    
    let accessibleCount = 0;
    let inaccessibleCount = 0;
    
    allQuotes.forEach((quote, index) => {
      const canView = PermissionUtils.canCustomerViewQuote(quote, customer1);
      const isOwn = quote.customer._id.toString() === customer1._id.toString();
      const quoteGroups = quote.customerGroups?.map(g => g.name).join(', ') || '无';
      
      console.log(`\n  ${index + 1}. ${quote.quoteNumber} - ${quote.customer.name}`);
      console.log(`     是否自己创建: ${isOwn ? '是' : '否'}`);
      console.log(`     询价单群组: ${quoteGroups}`);
      console.log(`     权限检查: ${canView ? '✅ 可以访问' : '❌ 不能访问'}`);
      
      if (canView) {
        accessibleCount++;
      } else {
        inaccessibleCount++;
      }
    });
    
    console.log(`\n📊 统计结果:`);
    console.log(`   可以访问的询价单: ${accessibleCount}`);
    console.log(`   不能访问的询价单: ${inaccessibleCount}`);
    
    // 验证与列表查询的一致性
    console.log('\n🔗 验证与列表查询的一致性:');
    
    // 构建列表查询条件
    const userCustomerGroupIds = customer1.customerGroups ? 
      customer1.customerGroups.map(id => id.toString()) : [];
    
    let query = {};
    if (userCustomerGroupIds.length > 0) {
      query = { 
        $or: [
          { customer: customer1._id },
          { customerGroups: { $in: userCustomerGroupIds } }
        ]
      };
    } else {
      query = { customer: customer1._id };
    }
    
    const listQuotes = await Quote.find(query)
      .populate('customer', 'name email company')
      .populate('customerGroups', 'name description color');
    
    console.log(`   列表查询结果: ${listQuotes.length} 个询价单`);
    console.log(`   详细页权限检查结果: ${accessibleCount} 个询价单`);
    
    if (listQuotes.length === accessibleCount) {
      console.log('✅ 列表查询与详细页权限检查一致！');
    } else {
      console.log('❌ 列表查询与详细页权限检查不一致！');
    }
    
    console.log('\n🎉 权限逻辑测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 数据库连接已关闭');
  }
}

testQuoteDetailPermission();