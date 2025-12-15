const mongoose = require('mongoose');
const Quote = require('../models/Quote');
const User = require('../models/User');
const CustomerGroup = require('../models/CustomerGroup');

async function testCustomerQueryLogic() {
  console.log('=== 测试客户询价单查询逻辑 ===\n');
  
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
    console.log(`   角色: ${customer1.role}`);
    console.log(`   客户群组数量: ${customer1.customerGroups?.length || 0}`);
    
    // 获取用户群组ID
    const userCustomerGroupIds = customer1.customerGroups ? 
      customer1.customerGroups.map(id => id.toString()) : [];
    
    console.log(`   群组IDs: ${userCustomerGroupIds.join(', ') || '无'}`);
    
    // 构建查询条件
    let query = {};
    if (userCustomerGroupIds.length > 0) {
      query = { 
        $or: [
          { customer: customer1._id }, // 自己创建的
          { 
            customerGroups: { $in: userCustomerGroupIds } // 与自己群组有交集
          }
        ]
      };
    } else {
      query = { customer: customer1._id };
    }
    
    console.log('\n📋 查询条件:');
    console.log(JSON.stringify(query, null, 2));
    
    // 执行查询
    const quotes = await Quote.find(query)
      .populate('customer', 'name email company')
      .populate('customerGroups', 'name description color');
    
    console.log(`\n✅ 查询结果: ${quotes.length} 个询价单`);
    
    // 显示询价单详情
    quotes.forEach((quote, index) => {
      const isOwnQuote = quote.customer._id.toString() === customer1._id.toString();
      const quoteGroups = quote.customerGroups?.map(g => g.name).join(', ') || '无';
      console.log(`\n  ${index + 1}. ${quote.quoteNumber}`);
      console.log(`     客户: ${quote.customer.name}`);
      console.log(`     是否自己创建: ${isOwnQuote ? '是' : '否'}`);
      console.log(`     询价单群组: ${quoteGroups}`);
    });
    
    // 验证逻辑
    console.log('\n🔍 验证逻辑:');
    const allQuotes = await Quote.find({}).populate('customer', 'name');
    console.log(`   系统中总询价单数量: ${allQuotes.length}`);
    console.log(`   Customer1可见询价单数量: ${quotes.length}`);
    
    const ownQuotes = allQuotes.filter(q => q.customer._id.toString() === customer1._id.toString());
    console.log(`   Customer1创建的询价单: ${ownQuotes.length}`);
    
    const sharedQuotes = quotes.filter(q => q.customer._id.toString() !== customer1._id.toString());
    console.log(`   通过群组共享看到的询价单: ${sharedQuotes.length}`);
    
    console.log('\n🎉 查询逻辑测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 数据库连接已关闭');
  }
}

testCustomerQueryLogic();