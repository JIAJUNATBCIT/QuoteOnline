# Angular CLI Schema 错误修复指南

## 🚨 问题描述

```
Unable to load schema from '\node_modules\@angular\cli\lib\config\schema.json': Schema not found
```

## 🔍 根本原因分析

1. **Node.js 版本不兼容**: 当前使用 Node.js 24.11.1，而 Angular 18 推荐使用 Node.js 18.x 或 20.x
2. **依赖安装问题**: fast-uri 包缺少 index.js 主文件
3. **版本冲突**: Angular CLI 版本与构建工具版本不匹配

## 🛠️ 修复方案

### 方案 1: 设置环境变量 (推荐)

在 PowerShell 中执行:
```powershell
$env:NG_IGNORE_VERSION_CHECK=1
npm run build
```

或者创建 `.env` 文件:
```env
NG_IGNORE_VERSION_CHECK=1
NG_CLI_ANALYTICS=false
```

### 方案 2: 降级 Node.js 版本 (最佳方案)

安装并使用 Node.js 20.x:
```powershell
# 使用 nvm-windows 管理 Node.js 版本
nvm install 20.18.0
nvm use 20.18.0
npm install --legacy-peer-deps
npm run build
```

### 方案 3: 临时修复 (当前使用)

已实施的修复措施:

1. **创建 .npmrc 配置**:
```ini
legacy-peer-deps=true
ignore-scripts=false
audit=false
fund=false
```

2. **修复 fast-uri 包**:
- 创建临时 `node_modules/fast-uri/index.js` 文件
- 确保包的基本功能可用

3. **更新 package.json**:
- 统一 Angular CLI 版本为 ^18.2.21
- 设置 TypeScript 版本为 ^5.4.5

## 📊 修复状态

| 项目 | 状态 | 说明 |
|------|------|------|
| Node.js 版本 | ⚠️ 不兼容 | 24.x (推荐 20.x) |
| Angular CLI | ✅ 已修复 | 版本 18.2.21 |
| Schema 文件 | ✅ 存在 | schema.json 正常 |
| fast-uri 包 | 🔧 临时修复 | 需要更好的解决方案 |
| 环境变量 | ✅ 已设置 | NG_IGNORE_VERSION_CHECK=1 |

## 🚀 使用方法

### 当前可用命令
```bash
# 标准构建 (需要环境变量)
$env:NG_IGNORE_VERSION_CHECK=1; npm run build

# 优化构建 (字体优化)
$env:NG_IGNORE_VERSION_CHECK=1; npm run build:optimized
```

### 开发服务器
```bash
$env:NG_IGNORE_VERSION_CHECK=1; npm start
```

## 🔄 永久解决方案

### 长期建议
1. **升级到兼容版本**: 降级到 Node.js 20.x
2. **更新 Angular**: 考虑升级到 Angular 19+ (支持 Node.js 24)
3. **重新安装依赖**: 完全清理后重新安装

### 立即可行的步骤
1. 备份当前项目
2. 删除 node_modules 和 package-lock.json
3. 使用 Node.js 20.x 重新安装
4. 验证所有功能正常

## ⚠️ 注意事项

1. **临时修复的局限性**: fast-uri 的临时修复可能影响某些高级功能
2. **版本警告**: 虽然可以工作，但建议使用兼容的 Node.js 版本
3. **生产环境**: 生产部署应使用标准配置，避免临时修复

## 📞 故障排除

### 如果仍有问题
1. 检查 Angular CLI 版本: `ng version`
2. 验证 schema.json 存在性
3. 确认所有依赖正确安装
4. 尝试清理缓存: `npm cache clean --force`

### 创建修复脚本
已创建 `fix-schema-error.js` 用于自动化修复常见问题。

---

**状态**: 🔧 部分修复 (需要 Node.js 版本升级)  
**最后更新**: 2025-12-07