const mongoose = require('mongoose');
require('dotenv').config();

async function fixCustomerFiles() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('=== 修复客户文件显示问题 ===');
  
  const QuoteWithGridFS = require('../models/QuoteWithGridFS');
  const { GridFSBucket } = require('mongodb');
  const bucket = new GridFSBucket(mongoose.connection.db);
  
  // 1. 检查GridFS中的所有文件
  const files = await bucket.find({}).toArray();
  console.log('GridFS中存储的文件总数:', files.length);
  
  files.forEach(file => {
    console.log('文件:', {
      id: file._id.toString(),
      filename: file.filename,
      uploadDate: file.uploadDate,
      metadata: file.metadata
    });
  });
  
  // 2. 检查所有询价单
  const quotes = await QuoteWithGridFS.find({}).select('quoteNumber customerFiles createdAt');
  console.log('\\n询价单总数:', quotes.length);
  
  quotes.forEach(quote => {
    console.log('询价单:', quote.quoteNumber);
    console.log('客户文件数量:', quote.customerFiles ? quote.customerFiles.length : 0);
    if (quote.customerFiles && quote.customerFiles.length > 0) {
      quote.customerFiles.forEach(f => {
        console.log('  - 文件引用:', f.originalName, '路径:', f.path);
      });
    }
    console.log('---');
  });
  
  // 3. 修复问题：如果文件存在但询价单中没有引用，重新建立关联
  const latestQuote = await QuoteWithGridFS.findOne({}).sort({ createdAt: -1 });
  if (latestQuote && (!latestQuote.customerFiles || latestQuote.customerFiles.length === 0)) {
    console.log('\\n发现需要修复的询价单:', latestQuote.quoteNumber);
    
    // 查找与该询价单创建时间相近的文件
    const quoteTime = latestQuote.createdAt;
    const timeWindowStart = new Date(quoteTime.getTime() - 60000); // 前1分钟
    const timeWindowEnd = new Date(quoteTime.getTime() + 60000); // 后1分钟
    
    const relatedFiles = files.filter(file => 
      file.uploadDate >= timeWindowStart && file.uploadDate <= timeWindowEnd
    );
    
    console.log('找到相关文件数量:', relatedFiles.length);
    
    if (relatedFiles.length > 0) {
      // 重建客户文件引用
      const customerFiles = relatedFiles.map(file => ({
        filename: file._id.toString(),
        originalName: file.metadata?.originalName || file.filename,
        path: file._id.toString(),
        size: file.length,
        uploadedAt: file.uploadDate
      }));
      
      latestQuote.customerFiles = customerFiles;
      await latestQuote.save();
      
      console.log('✅ 已修复询价单文件引用');
      console.log('修复后的客户文件:', customerFiles.map(f => f.originalName));
    }
  }
  
  await mongoose.disconnect();
  console.log('\\n✅ 修复完成');
}

fixCustomerFiles().catch(console.error);