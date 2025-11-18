const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const http = require('http');

// 创建测试Excel文件（模拟）
function createTestFile() {
  const testFilePath = path.join(__dirname, 'test-upload.xlsx');
  const testContent = 'PK\x03\x04...'; // 简单的Excel文件标识
  
  fs.writeFileSync(testFilePath, testContent);
  return testFilePath;
}

// 测试上传性能
async function testUploadPerformance() {
  console.log('开始上传性能测试...');
  
  const testFile = createTestFile();
  const token = 'your-test-token-here'; // 需要替换为实际token
  const quoteId = 'test-quote-id'; // 需要替换为实际询价单ID
  
  const form = new FormData();
  form.append('quoterFile', fs.createReadStream(testFile));
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: `/api/quotes/${quoteId}`,
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      ...form.getHeaders()
    },
    timeout: 60000
  };
  
  const startTime = Date.now();
  
  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`上传完成，耗时: ${duration}ms`);
      console.log(`响应状态: ${res.statusCode}`);
      console.log(`响应数据:`, data);
      
      // 清理测试文件
      fs.unlinkSync(testFile);
      
      // 性能评估
      if (duration < 3000) {
        console.log('✅ 上传性能良好 (< 3秒)');
      } else if (duration < 10000) {
        console.log('⚠️ 上传性能一般 (3-10秒)');
      } else {
        console.log('❌ 上传性能较差 (> 10秒)');
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('上传测试失败:', error);
    fs.unlinkSync(testFile);
  });
  
  req.on('timeout', () => {
    console.error('上传测试超时');
    req.destroy();
    fs.unlinkSync(testFile);
  });
  
  // 监听上传进度
  form.getLength((err, length) => {
    if (!err) {
      console.log(`文件大小: ${length} bytes`);
    }
  });
  
  form.pipe(req);
}

// 数据库查询性能测试
async function testDatabasePerformance() {
  console.log('\n开始数据库查询性能测试...');
  
  const mongoose = require('mongoose');
  
  try {
    await mongoose.connect('mongodb://localhost:27017/quoteonline');
    
    const Quote = require('./models/Quote');
    
    // 测试常用查询
    const tests = [
      {
        name: '查询所有询价单',
        query: () => Quote.find().populate('customer', 'name email company').populate('quoter', 'name email company')
      },
      {
        name: '按客户查询',
        query: () => Quote.find({ customer: '60c72b2f9b1d8e001f8e8b1a' }).populate('customer', 'name email company')
      },
      {
        name: '按状态查询',
        query: () => Quote.find({ status: 'pending' }).sort({ createdAt: -1 })
      },
      {
        name: '复合查询',
        query: () => Quote.find({ status: 'pending', customer: '60c72b2f9b1d8e001f8e8b1a' }).sort({ createdAt: -1 })
      }
    ];
    
    for (const test of tests) {
      const startTime = Date.now();
      await test.query();
      const duration = Date.now() - startTime;
      
      console.log(`${test.name}: ${duration}ms`);
      
      if (duration < 100) {
        console.log('  ✅ 查询性能优秀');
      } else if (duration < 500) {
        console.log('  ⚠️ 查询性能一般');
      } else {
        console.log('  ❌ 查询性能需要优化');
      }
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('数据库测试失败:', error);
  }
}

// 主函数
async function main() {
  console.log('=== 询价系统性能测试 ===\n');
  
  // 检查服务器是否运行
  console.log('检查服务器状态...');
  
  try {
    await testDatabasePerformance();
    console.log('\n注意: 上传测试需要有效的token和询价单ID');
    console.log('如需测试上传性能，请修改脚本中的token和quoteId变量');
  } catch (error) {
    console.error('性能测试失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = { testUploadPerformance, testDatabasePerformance };