const fs = require('fs');
const path = require('path');

console.log('🔍 检查未使用的依赖...');

const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const dependencies = Object.keys(packageJson.dependencies);

const srcDir = path.join(__dirname, '../src');

// 检查依赖是否在代码中使用
function isDependencyUsed(depName) {
    const searchPatterns = [
        `import.*from.*['"]${depName}`,
        `require\\(['"]${depName}`,
        `@NgModule.*import.*${depName}`,
        depName
    ];

    function checkDirectory(dir) {
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
                if (checkDirectory(filePath)) return true;
            } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.html'))) {
                const content = fs.readFileSync(filePath, 'utf8');
                
                for (const pattern of searchPatterns) {
                    if (new RegExp(pattern, 'i').test(content)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    return checkDirectory(srcDir);
}

console.log('\n📦 依赖使用情况:');
const unusedDeps = [];
const usedDeps = [];

dependencies.forEach(dep => {
    const isUsed = isDependencyUsed(dep);
    if (isUsed) {
        usedDeps.push(dep);
        console.log(`   ✅ ${dep} - 已使用`);
    } else {
        unusedDeps.push(dep);
        console.log(`   ❌ ${dep} - 未使用`);
    }
});

if (unusedDeps.length > 0) {
    console.log(`\n💡 发现 ${unusedDeps.length} 个未使用的依赖:`);
    console.log(`   ${unusedDeps.join(', ')}`);
    console.log(`\n⚠️  手动移除命令:`);
    unusedDeps.forEach(dep => {
        console.log(`   npm uninstall ${dep}`);
    });
} else {
    console.log('\n🎉 所有依赖都在使用中!');
}

console.log(`\n📊 统计:`);
console.log(`   - 总依赖数: ${dependencies.length}`);
console.log(`   - 已使用: ${usedDeps.length}`);
console.log(`   - 未使用: ${unusedDeps.length}`);