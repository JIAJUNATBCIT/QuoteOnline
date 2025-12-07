const fs = require('fs');
const path = require('path');

console.log('🔧 开始生产环境代码优化...');

const srcDir = path.join(__dirname, '../src');

// 需要处理的文件类型
const fileTypes = ['.ts', '.html', '.scss'];

// 要移除的console模式
const consolePatterns = [
    /console\.log\([^)]*\);?/g,
    /console\.warn\([^)]*\);?/g,
    /console\.error\([^)]*\);?/g,
    /console\.debug\([^)]*\);?/g,
    /console\.info\([^)]*\);?/g
];

function processFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalSize = content.length;
        let changes = 0;

        // 移除console语句
        consolePatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                changes += matches.length;
                content = content.replace(pattern, '');
            }
        });

        // 移除多余的空行
        content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

        // 移除行尾空格
        content = content.replace(/[ \t]+$/gm, '');

        if (content.length !== originalSize) {
            fs.writeFileSync(filePath, content);
            const savedBytes = originalSize - content.length;
            console.log(`   ✅ ${path.relative(srcDir, filePath)}: 移除 ${changes} 个console语句，节省 ${savedBytes} 字节`);
            return savedBytes;
        }
    } catch (error) {
        console.log(`   ⚠️  跳过文件: ${path.relative(srcDir, filePath)}`);
    }
    return 0;
}

function scanDirectory(dir) {
    let totalSaved = 0;
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
            totalSaved += scanDirectory(filePath);
        } else if (stat.isFile()) {
            const ext = path.extname(file);
            if (fileTypes.includes(ext)) {
                totalSaved += processFile(filePath);
            }
        }
    }

    return totalSaved;
}

const totalSaved = scanDirectory(srcDir);

console.log(`\n🎉 代码优化完成!`);
console.log(`   - 总共节省: ${totalSaved} 字节`);
console.log(`   - 优化文件: ${fileTypes.join(', ')}`);
console.log(`\n💡 提示: 这只影响源码，不会影响调试功能`);