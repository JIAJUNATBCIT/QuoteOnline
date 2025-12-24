const mongoose = require('mongoose');
require('dotenv').config();

async function debugPermissions() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('=== 调试权限和文件显示问题 ===');
  
  const QuoteWithGridFS = require('../models/QuoteWithGridFS');
  const User = require('../models/User');
  
  // 检查最新的询价单
  const latestQuote = await QuoteWithGridFS.findOne({})
    .sort({ createdAt: -1 })
    .populate('customer', 'name email')
    .select('quoteNumber customerFiles customer title description status createdAt');
  
  console.log('最新询价单详情:');
  console.log(JSON.stringify(latestQuote, null, 2));
  
  // 检查客户文件字段
  console.log('\\n客户文件字段详情:');
  if (latestQuote.customerFiles && latestQuote.customerFiles.length > 0) {
    latestQuote.customerFiles.forEach((file, index) => {
      console.log(`文件 ${index + 1}:`, {
        filename: file.filename,
        originalName: file.originalName,
        path: file.path,
        size: file.size,
        uploadedAt: file.uploadedAt
      });
    });
  } else {
    console.log('客户文件字段为空');
  }
  
  // 检查权限设置
  console.log('\\n权限相关字段:');
  console.log('客户ID:', latestQuote.customer?._id || latestQuote.customer);
  console.log('询价单状态:', latestQuote.status);
  console.log('创建时间:', latestQuote.createdAt);
  
  // 检查删除权限逻辑
  console.log('\\n删除权限检查:');
  const PermissionUtils = require('../utils/permissionUtils');
  
  // 模拟客户用户
  const mockCustomerUser = {
    userId: latestQuote.customer?._id || latestQuote.customer,
    role: 'customer'
  };
  
  const canDelete = PermissionUtils.canDeleteQuote(latestQuote, mockCustomerUser);
  console.log('客户是否可以删除:', canDelete);
  
  await mongoose.disconnect();
}

debugPermissions().catch(console.error);