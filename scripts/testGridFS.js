const mongoose = require('mongoose');
const GridFSStorage = require('../utils/gridfsStorage');
require('dotenv').config();

async function testGridFS() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✓ MongoDB连接成功');
    
    const gridfsStorage = new GridFSStorage();
    
    // 测试文件信息获取
    console.log('正在测试GridFS功能...');
    
    // 创建测试文件
    const testFile = {
      originalname: 'test.xlsx',
      stream: require('stream').Readable.from(['test content']),
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    
    // 测试文件上传
    console.log('测试文件上传...');
    const fileInfo = await new Promise((resolve, reject) => {
      gridfsStorage._handleFile(null, testFile, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    
    console.log('✓ 文件上传成功:', fileInfo);
    
    // 测试文件下载
    console.log('测试文件下载...');
    const downloadStream = await gridfsStorage.getFileStream(fileInfo.filename);
    console.log('✓ 文件下载流创建成功');
    
    // 测试文件信息获取
    console.log('测试文件信息获取...');
    const fileInfoFromDB = await gridfsStorage.getFileInfo(fileInfo.path);
    console.log('✓ 文件信息获取成功:', {
      filename: fileInfoFromDB.filename,
      length: fileInfoFromDB.length,
      uploadDate: fileInfoFromDB.uploadDate
    });
    
    // 测试文件删除
    console.log('测试文件删除...');
    await new Promise((resolve, reject) => {
      gridfsStorage._removeFile(null, fileInfo, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    
    console.log('✓ 文件删除成功');
    
    console.log('\n🎉 GridFS功能测试全部通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('数据库连接已关闭');
  }
}

// 运行测试
if (require.main === module) {
  testGridFS().catch(console.error);
}

module.exports = testGridFS;