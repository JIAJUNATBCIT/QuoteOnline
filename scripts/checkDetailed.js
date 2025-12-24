const mongoose = require('mongoose');
require('dotenv').config();

async function checkDetailed() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('=== 检查所有询价单数据 ===');
  
  // 检查原版询价单
  const Quote = require('../models/Quote');
  const oldQuotes = await Quote.find({}).select('quoteNumber customerFiles createdAt');
  console.log('原版询价单总数:', oldQuotes.length);
  oldQuotes.forEach(q => {
    console.log('询价单:', q.quoteNumber, '创建时间:', q.createdAt);
    console.log('客户文件数量:', q.customerFiles ? q.customerFiles.length : 0);
    if (q.customerFiles && q.customerFiles.length > 0) {
      q.customerFiles.forEach(f => {
        console.log('  - 文件:', f.originalName, '路径:', f.path);
      });
    }
    console.log('---');
  });
  
  // 检查GridFS版本询价单
  const QuoteWithGridFS = require('../models/QuoteWithGridFS');
  const newQuotes = await QuoteWithGridFS.find({}).select('quoteNumber customerFiles createdAt');
  console.log('\nGridFS版本询价单总数:', newQuotes.length);
  newQuotes.forEach(q => {
    console.log('询价单:', q.quoteNumber, '创建时间:', q.createdAt);
    console.log('客户文件数量:', q.customerFiles ? q.customerFiles.length : 0);
    if (q.customerFiles && q.customerFiles.length > 0) {
      q.customerFiles.forEach(f => {
        console.log('  - 文件:', f.originalName, '路径:', f.path, '文件ID:', f.filename);
      });
    }
    console.log('---');
  });
  
  await mongoose.disconnect();
}

checkDetailed().catch(console.error);