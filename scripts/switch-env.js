#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 读取.env文件
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// 解析环境变量
const parseEnv = (content) => {
  const lines = content.split('\n');
  const env = {};
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  return env;
};

// 更新环境变量
const updateEnv = (key, value) => {
  const lines = envContent.split('\n');
  let found = false;
  
  const updatedLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  
  if (!found) {
    updatedLines.push(`${key}=${value}`);
  }
  
  return updatedLines.join('\n');
};

// 主函数
const main = () => {
  const args = process.argv.slice(2);
  const environment = args[0];

  if (!environment) {
    console.log('用法: node switch-env.js [development|production|test]');
    console.log('');
    console.log('当前环境配置:');
    const currentEnv = parseEnv(envContent);
    console.log(`NODE_ENV = ${currentEnv.NODE_ENV || 'development'}`);
    console.log(`FRONTEND_URL = ${currentEnv.FRONTEND_URL || 'http://localhost:4200'}`);
    console.log(`MONGODB_URI = ${currentEnv.MONGODB_URI || 'mongodb://localhost:27017/quoteonline'}`);
    return;
  }

  const validEnvs = ['development', 'production', 'test'];
  if (!validEnvs.includes(environment)) {
    console.error(`错误: 无效的环境 "${environment}"，支持的环境: ${validEnvs.join(', ')}`);
    process.exit(1);
  }

  console.log(`正在切换到 ${environment} 环境...`);

  let newContent = envContent;

  // 根据环境更新配置
  switch (environment) {
    case 'development':
      newContent = updateEnv('NODE_ENV', 'development');
      newContent = newContent.replace(/MONGODB_URI=mongodb\+.+/, 'MONGODB_URI=mongodb://localhost:27017/quoteonline');
      newContent = updateEnv('FRONTEND_URL', 'http://localhost:4200');
      break;
      
    case 'production':
      newContent = updateEnv('NODE_ENV', 'production');
      newContent = updateEnv('FRONTEND_URL', 'https://portal.ooishipping.com');
      // 生产环境需要手动设置MongoDB URI
      if (!envContent.includes('mongodb+srv://')) {
        console.log('警告: 生产环境需要设置MongoDB Atlas连接字符串');
      }
      break;
      
    case 'test':
      newContent = updateEnv('NODE_ENV', 'test');
      newContent = updateEnv('FRONTEND_URL', 'http://localhost:4200');
      newContent = updateEnv('MONGODB_URI', 'mongodb://localhost:27017/quoteonline_test');
      break;
  }

  // 写入更新的.env文件
  fs.writeFileSync(envPath, newContent);
  
  console.log(`✅ 已成功切换到 ${environment} 环境`);
  
  const updatedEnv = parseEnv(newContent);
  console.log('');
  console.log('更新后的配置:');
  console.log(`NODE_ENV = ${updatedEnv.NODE_ENV}`);
  console.log(`FRONTEND_URL = ${updatedEnv.FRONTEND_URL}`);
  console.log(`MONGODB_URI = ${updatedEnv.MONGODB_URI}`);
  
  console.log('');
  console.log('🚀 现在可以启动服务器了: npm start');
};

main();