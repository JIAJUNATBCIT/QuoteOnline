const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
require('dotenv').config();

async function fixAllIssues() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('=== 修复所有问题 ===');
  
  const QuoteWithGridFS = require('../models/QuoteWithGridFS');
  const bucket = new GridFSBucket(mongoose.connection.db);
  
  // 1. 检查当前数据状态
  console.log('1. 检查当前数据状态');
  
  const quotes = await QuoteWithGridFS.find({}).select('quoteNumber customerFiles createdAt');
  console.log('询价单总数:', quotes.length);
  
  const files = await bucket.find({}).toArray();
  console.log('GridFS文件总数:', files.length);
  
  // 2. 修复客户文件显示问题
  console.log('\\n2. 修复客户文件显示问题');
  
  for (const quote of quotes) {
    if (!quote.customerFiles || quote.customerFiles.length === 0) {
      console.log('修复询价单:', quote.quoteNumber);
      
      // 查找与该询价单创建时间相近的文件
      const timeWindowStart = new Date(quote.createdAt.getTime() - 120000); // 前2分钟
      const timeWindowEnd = new Date(quote.createdAt.getTime() + 120000); // 后2分钟
      
      const relatedFiles = files.filter(file => 
        file.uploadDate >= timeWindowStart && file.uploadDate <= timeWindowEnd
      );
      
      if (relatedFiles.length > 0) {
        // 重建客户文件引用
        const customerFiles = relatedFiles.map(file => ({
          filename: file._id.toString(),
          originalName: file.metadata?.originalName || file.filename,
          path: file._id.toString(),
          size: file.length,
          uploadedAt: file.uploadDate
        }));
        
        quote.customerFiles = customerFiles;
        await quote.save();
        
        console.log('  ✅ 已修复，关联文件:', customerFiles.map(f => f.originalName));
      } else {
        console.log('  ⚠️ 未找到相关文件');
      }
    }
  }
  
  // 3. 验证修复结果
  console.log('\\n3. 验证修复结果');
  
  const updatedQuotes = await QuoteWithGridFS.find({}).select('quoteNumber customerFiles');
  updatedQuotes.forEach(quote => {
    console.log('询价单:', quote.quoteNumber, '客户文件数量:', quote.customerFiles ? quote.customerFiles.length : 0);
  });
  
  await mongoose.disconnect();
  console.log('\\n✅ 所有问题修复完成');
}

fixAllIssues().catch(console.error);