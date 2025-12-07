const fs = require('fs');
const path = require('path');

console.log('📊 生成性能报告...');

const distDir = path.join(__dirname, '../dist/quote-online-client');

function getFileSize(filePath) {
    const stats = fs.statSync(filePath);
    return stats.size;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function analyzeBuild() {
    if (!fs.existsSync(distDir)) {
        console.log('❌ 构建目录不存在，请先运行构建');
        return;
    }

    const files = fs.readdirSync(distDir);
    let totalSize = 0;
    const fileDetails = [];

    files.forEach(file => {
        const filePath = path.join(distDir, file);
        const size = getFileSize(filePath);
        totalSize += size;
        
        fileDetails.push({
            name: file,
            size: size,
            sizeFormatted: formatBytes(size)
        });
    });

    // 按大小排序
    fileDetails.sort((a, b) => b.size - a.size);

    console.log('\n📦 构建文件分析:');
    console.log('=' .repeat(60));
    fileDetails.forEach(file => {
        const percentage = ((file.size / totalSize) * 100).toFixed(1);
        console.log(`${file.name.padEnd(35)} ${file.sizeFormatted.padEnd(10)} ${percentage}%`);
    });

    console.log('\n📊 总体统计:');
    console.log(`   总大小: ${formatBytes(totalSize)}`);
    console.log(`   文件数量: ${files.length}`);
    
    // 分析主要文件
    const jsFiles = fileDetails.filter(f => f.name.endsWith('.js'));
    const cssFiles = fileDetails.filter(f => f.name.endsWith('.css'));
    const fontFiles = fileDetails.filter(f => f.name.endsWith('.woff2'));
    
    if (jsFiles.length > 0) {
        const jsTotalSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
        console.log(`   JS 总大小: ${formatBytes(jsTotalSize)} (${((jsTotalSize/totalSize)*100).toFixed(1)}%)`);
    }
    
    if (cssFiles.length > 0) {
        const cssTotalSize = cssFiles.reduce((sum, f) => sum + f.size, 0);
        console.log(`   CSS 总大小: ${formatBytes(cssTotalSize)} (${((cssTotalSize/totalSize)*100).toFixed(1)}%)`);
    }
    
    if (fontFiles.length > 0) {
        const fontTotalSize = fontFiles.reduce((sum, f) => sum + f.size, 0);
        console.log(`   字体总大小: ${formatBytes(fontTotalSize)} (${((fontTotalSize/totalSize)*100).toFixed(1)}%)`);
    }

    // 性能建议
    console.log('\n💡 性能优化建议:');
    
    if (totalSize > 2 * 1024 * 1024) { // > 2MB
        console.log('   ⚠️  总大小较大，建议进行代码分割');
    }
    
    const mainJs = fileDetails.find(f => f.name.includes('main.'));
    if (mainJs && mainJs.size > 500 * 1024) { // > 500KB
        console.log('   ⚠️  主JS文件较大，考虑懒加载');
    }
    
    const cssFile = fileDetails.find(f => f.name.includes('styles.'));
    if (cssFile && cssFile.size > 200 * 1024) { // > 200KB
        console.log('   ⚠️  CSS文件较大，考虑按组件分离样式');
    }

    // 生成报告文件
    const report = {
        timestamp: new Date().toISOString(),
        totalSize: totalSize,
        fileCount: files.length,
        files: fileDetails,
        recommendations: []
    };

    if (totalSize > 2 * 1024 * 1024) report.recommendations.push('考虑代码分割');
    if (mainJs && mainJs.size > 500 * 1024) report.recommendations.push('考虑懒加载');
    if (cssFile && cssFile.size > 200 * 1024) report.recommendations.push('分离CSS样式');

    fs.writeFileSync(
        path.join(__dirname, '../performance-report.json'),
        JSON.stringify(report, null, 2)
    );
    
    console.log('\n📄 详细报告已保存到: performance-report.json');
}

analyzeBuild();