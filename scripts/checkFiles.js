const mongoose = require('mongoose');
require('dotenv').config();

async function checkQuotes() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Quote = require('../models/Quote');
  const QuoteWithGridFS = require('../models/QuoteWithGridFS');
  
  // 检查原版询价单
  const oldQuotes = await Quote.find({}).select('quoteNumber customerFiles').limit(2);
  console.log('=== 原版询价单数据 ===');
  oldQuotes.forEach(q => {
    console.log('询价单:', q.quoteNumber);
    console.log('客户文件数量:', q.customerFiles ? q.customerFiles.length : 0);
    if (q.customerFiles && q.customerFiles.length > 0) {
      console.log('文件详情:', q.customerFiles.map(f => ({ 
        filename: f.filename, 
        originalName: f.originalName,
        path: f.path 
      })));
    }
    console.log('---');
  });
  
  // 检查GridFS版本询价单
  const newQuotes = await QuoteWithGridFS.find({}).select('quoteNumber customerFiles').limit(2);
  console.log('\n=== GridFS版本询价单数据 ===');
  newQuotes.forEach(q => {
    console.log('询价单:', q.quoteNumber);
    console.log('客户文件数量:', q.customerFiles ? q.customerFiles.length : 0);
    if (q.customerFiles && q.customerFiles.length > 0) {
      console.log('文件详情:', q.customerFiles.map(f => ({ 
        filename: f.filename, 
        originalName: f.originalName,
        path: f.path 
      })));
    }
    console.log('---');
  });
  
  await mongoose.disconnect();
}

checkQuotes().catch(console.error);