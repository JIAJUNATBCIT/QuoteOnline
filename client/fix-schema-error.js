#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 修复 Angular CLI Schema 错误脚本
 * 
 * 主要解决 Node.js 版本不兼容导致的 schema 文件问题
 */

console.log('🔧 开始修复 Angular CLI Schema 错误...');

// 设置环境变量忽略版本检查
process.env.NG_IGNORE_VERSION_CHECK = '1';
process.env.NG_CLI_ANALYTICS = 'false';

// 检查关键文件
const packageJsonPath = path.join(__dirname, 'package.json');
const angularJsonPath = path.join(__dirname, 'angular.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json 不存在');
  process.exit(1);
}

if (!fs.existsSync(angularJsonPath)) {
  console.error('❌ angular.json 不存在');
  process.exit(1);
}

console.log('✅ 关键配置文件检查通过');

// 创建 .npmrc 文件来设置配置
const npmrcContent = `
legacy-peer-deps=true
ignore-scripts=false
audit=false
fund=false
`;

const npmrcPath = path.join(__dirname, '.npmrc');
fs.writeFileSync(npmrcPath, npmrcContent.trim());
console.log('✅ 创建 .npmrc 配置文件');

// 修复 package.json 中的版本依赖
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// 确保 Angular CLI 版本一致性
if (packageJson.devDependencies) {
  packageJson.devDependencies['@angular/cli'] = '^18.2.21';
  packageJson.devDependencies['@angular-devkit/build-angular'] = '^18.2.21';
  
  // 确保 TypeScript 版本兼容
  packageJson.devDependencies['typescript'] = '^5.4.5';
}

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log('✅ 更新 package.json 版本配置');

console.log('\n🎉 Angular CLI Schema 修复完成!');
console.log('\n📝 后续步骤:');
console.log('1. 运行: npm install --legacy-peer-deps');
console.log('2. 运行: npm run build');
console.log('3. 如果仍有问题，设置环境变量: NG_IGNORE_VERSION_CHECK=1');

console.log('\n🚀 修复脚本执行完成!');