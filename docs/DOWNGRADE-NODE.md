# Node.js 降级操作指南

## 🎯 目标版本
- **从**: Node.js 24.11.1
- **降到**: Node.js 20.18.0 (Angular 18 兼容)

## 方案 A: 使用 nvm-windows (推荐)

### 1. 安装 nvm-windows
```powershell
# 下载并安装 nvm-windows
# 访问: https://github.com/coreybutler/nvm-windows/releases
# 下载 nvm-setup.zip 并安装
```

### 2. 安装 Node.js 20.18.0
```powershell
# 安装 Node.js 20.18.0
nvm install 20.18.0

# 切换到 Node.js 20.18.0
nvm use 20.18.0

# 验证版本
node --version  # 应该显示 v20.18.0
```

### 3. 重新安装项目依赖
```powershell
cd c:/Users/darke/quoteonline/client

# 清理现有依赖
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

# 重新安装
npm install --legacy-peer-deps

# 测试构建
npm run build
```

## 方案 B: 手动降级 (无需 nvm)

### 1. 下载 Node.js 20.18.0
- 访问: https://nodejs.org/download/release/v20.18.0/
- 下载: `node-v20.18.0-x64.msi` (Windows 64位)

### 2. 卸载当前 Node.js
- 打开 "控制面板" → "程序和功能"
- 找到 "Node.js" 并卸载
- 重启计算机

### 3. 安装 Node.js 20.18.0
- 运行下载的 `node-v20.18.0-x64.msi`
- 按向导完成安装

### 4. 验证安装
```powershell
# 重启 PowerShell 后检查
node --version    # 应该显示 v20.18.0
npm --version     # 应该显示对应的 npm 版本
```

## 方案 C: 使用 Chocolatey (如果已安装)

```powershell
# 卸载当前版本
choco uninstall nodejs

# 安装指定版本
choco install nodejs --version=20.18.0

# 验证
node --version
```

## 🔧 降级后项目设置

### 1. 更新项目配置
```powershell
cd c:/Users/darke/quoteonline/client

# 设置 npm 配置
npm config set legacy-peer-deps true

# 清理缓存
npm cache clean --force
```

### 2. 重新安装依赖
```powershell
# 删除旧依赖
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json

# 重新安装
npm install --legacy-peer-deps
```

### 3. 验证 Angular CLI
```powershell
# 检查版本兼容性
ng version

# 应该看到类似输出:
# Angular CLI: 18.2.21
# Node: 20.18.0
# Angular: 18.2.14
```

### 4. 测试构建
```powershell
# 标准构建
npm run build

# 优化构建 (字体优化)
npm run build:optimized
```

## ✅ 成功标志

构建成功后应该看到:
```
✔ Browser application bundle generation complete.
✔ Copying assets complete.
✔ Index html generation complete.

Initial chunk files           | Names         |  Raw size | Estimated transfer size
main.XXXXXX.js               | main          | XXX.XX kB |               XXX.XX kB
styles.XXXXXX.css            | styles        | XXX.XX kB |                XXX.XX kB
...

🔧 开始字体优化...
✅ 保留: bootstrap-icons.XXXXX.woff2 (130.90 KB)
🗑️  移除: bootstrap-icons.XXXXX.woff (176.06 KB)
🎉 字体优化完成!
```

## 🚨 故障排除

### 如果 ng version 显示错误
```powershell
# 重新安装 Angular CLI
npm install -g @angular/cli@18.2.21

# 或本地安装
npm install @angular/cli@18.2.21 --save-dev
```

### 如果仍有依赖问题
```powershell
# 完全清理并重新安装
npm cache clean --force
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install --legacy-peer-deps
```

## 📋 操作检查清单

- [ ] 备份当前项目
- [ ] 安装 nvm-windows 或手动降级
- [ ] 验证 Node.js 版本为 v20.18.0
- [ ] 清理 node_modules 和 package-lock.json
- [ ] 重新安装依赖
- [ ] 测试 `ng version` 无警告
- [ ] 测试 `npm run build` 成功
- [ ] 测试 `npm run build:optimized` 成功

---

**推荐使用方案 A (nvm-windows)**，因为可以随时切换版本，更灵活。

**完成后，Angular CLI Schema 错误应该完全解决！**