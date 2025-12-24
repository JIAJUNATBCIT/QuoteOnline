const mongoose = require('mongoose');
require('dotenv').config();

async function deepDebug() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('=== 深度调试文件引用问题 ===');
  
  const QuoteWithGridFS = require('../models/QuoteWithGridFS');
  
  // 检查询价单的完整数据
  const quote = await QuoteWithGridFS.findOne({ quoteNumber: 'Q25122401' });
  
  console.log('询价单完整数据:');
  console.log(JSON.stringify(quote.toObject(), null, 2));
  
  // 检查customerFiles字段的详细情况
  console.log('\\n客户文件字段详情:');
  console.log('customerFiles类型:', typeof quote.customerFiles);
  console.log('customerFiles值:', quote.customerFiles);
  console.log('customerFiles长度:', quote.customerFiles ? quote.customerFiles.length : 'null/undefined');
  
  // 检查是否有文件被设置为空数组
  if (Array.isArray(quote.customerFiles)) {
    console.log('数组元素详情:');
    quote.customerFiles.forEach((file, index) => {
      console.log(`文件 ${index}:`, file);
    });
  }
  
  // 检查数据库中的实际存储
  const dbQuote = await mongoose.connection.db.collection('quotewithgridfs').findOne({ quoteNumber: 'Q25122401' });
  console.log('\\n数据库中存储的数据:');
  console.log('customerFiles字段:', dbQuote.customerFiles);
  
  await mongoose.disconnect();
}

deepDebug().catch(console.error);