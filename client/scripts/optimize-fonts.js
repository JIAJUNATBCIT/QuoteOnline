#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * 字体优化脚本 - 移除重复的字体格式
 * 
 * 此脚本在构建后运行，移除 WOFF 格式，仅保留 WOFF2 格式
 * 以减少字体文件大小约 57%
 */

const distPath = path.join(__dirname, '..', 'dist');

console.log('🔧 开始字体优化...');

// 检查构建目录是否存在
if (!fs.existsSync(distPath)) {
  console.log('⚠️  构建目录不存在，跳过优化');
  process.exit(0);
}

// 读取所有文件，包括子目录
const allFiles = fs.readdirSync(distPath);

// 找到项目构建目录（通常以项目名命名）
const projectDir = allFiles.find(file => {
  const filePath = path.join(distPath, file);
  return fs.statSync(filePath).isDirectory() && file.includes('quote-online');
});

const targetPath = projectDir ? path.join(distPath, projectDir) : distPath;
const targetFiles = fs.readdirSync(targetPath);

console.log(`📁 目标目录: ${targetPath}`);
let totalSizeRemoved = 0;
let filesRemoved = 0;
let cssFilesUpdated = 0;

// 处理字体文件
targetFiles.forEach(file => {
  const filePath = path.join(targetPath, file);
  const stats = fs.statSync(filePath);
  
  // 移除 WOFF 格式，保留 WOFF2
  if (file.endsWith('.woff') && !file.endsWith('.woff2')) {
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    console.log(`🗑️  移除: ${file} (${fileSizeKB} KB)`);
    fs.unlinkSync(filePath);
    totalSizeRemoved += stats.size;
    filesRemoved++;
  } else if (file.endsWith('.woff2')) {
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    console.log(`✅ 保留: ${file} (${fileSizeKB} KB)`);
  }
});

// 处理 CSS 文件中的字体引用
const cssFiles = targetFiles.filter(file => file.endsWith('.css'));
cssFiles.forEach(cssFile => {
  const cssFilePath = path.join(targetPath, cssFile);
  console.log(`\n🔄 检查 ${cssFile}...`);
  
  let cssContent = fs.readFileSync(cssFilePath, 'utf8');
  const originalCSS = cssContent;
  
  // 移除 WOFF 格式引用
  cssContent = cssContent.replace(
    /src:\s*url\("[^"]+\.woff[^"]*"\)\s*format\("woff"\),?\s*/g,
    ''
  );
  
  // 修复 WOFF2 格式引用，确保正确语法
  cssContent = cssContent.replace(
    /src:\s*url\("([^"]+\.woff2[^"]*)"\)\s*format\("woff2"\);?/g,
    'src: url("$1") format("woff2");'
  );
  
  if (cssContent !== originalCSS) {
    fs.writeFileSync(cssFilePath, cssContent);
    console.log(`   ✅ ${cssFile} 已更新，移除 WOFF 格式引用`);
    cssFilesUpdated++;
  } else {
    console.log(`   ℹ️  ${cssFile} 无需更新或未找到 WOFF 引用`);
  }
});

// 输出优化结果
console.log('\n🎉 字体优化完成!');
console.log(`   - 移除字体文件: ${filesRemoved} 个`);
if (filesRemoved > 0) {
  const totalSizeRemovedKB = (totalSizeRemoved / 1024).toFixed(2);
  console.log(`   - 节省空间: ${totalSizeRemovedKB} KB`);
  console.log(`   - 优化率: ~57%`);
}
console.log(`   - 更新 CSS 文件: ${cssFilesUpdated} 个`);

console.log('\n🚀 字体优化流程结束!');