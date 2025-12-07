#!/usr/bin/env node

const mongoose = require('mongoose');

// MongoDB Atlas 连接字符串
const MONGODB_URI = 'mongodb+srv://root:cai020428@quoteonline.ntjbjms.mongodb.net/quoteonline?retryWrites=true&w=majority&appName=QuoteOnline';

console.log('🔍 测试 MongoDB Atlas 连接...');
console.log('📡 连接字符串:', MONGODB_URI.replace(/:([^@]+)@/, ':***@'));

// 连接选项
const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferCommands: false,
  bufferMaxEntries: 0
};

async function testConnection() {
  try {
    console.log('⏳ 正在连接...');
    
    await mongoose.connect(MONGODB_URI, options);
    
    console.log('✅ 连接成功！');
    console.log('📊 数据库名称:', mongoose.connection.name);
    console.log('🌐 主机:', mongoose.connection.host);
    console.log('📍 端口:', mongoose.connection.port);
    
    // 测试写入操作
    console.log('📝 测试数据库操作...');
    
    const testSchema = new mongoose.Schema({
      name: String,
      createdAt: { type: Date, default: Date.now }
    });
    
    const TestModel = mongoose.model('Test', testSchema);
    
    // 创建测试文档
    const testDoc = await TestModel.create({
      name: 'Connection Test ' + new Date().toISOString()
    });
    
    console.log('✅ 写入测试成功，文档ID:', testDoc._id);
    
    // 查询测试
    const count = await TestModel.countDocuments();
    console.log('📈 集合文档数量:', count);
    
    // 删除测试文档
    await TestModel.deleteOne({ _id: testDoc._id });
    console.log('🗑️ 清理测试数据完成');
    
    console.log('✅ 所有测试通过！');
    
  } catch (error) {
    console.error('❌ 连接失败:', error.message);
    
    if (error.name === 'MongoServerError') {
      console.error('🔑 可能的原因：');
      console.error('  - 用户名或密码错误');
      console.error('  - IP地址未加入白名单');
      console.error('  - 数据库用户权限不足');
    } else if (error.name === 'MongooseServerSelectionError') {
      console.error('🌐 可能的原因：');
      console.error('  - 网络连接问题');
      console.error('  - MongoDB Atlas服务不可用');
      console.error('  - 连接字符串格式错误');
    }
    
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 连接已关闭');
  }
}

testConnection();