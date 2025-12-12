# 环境配置说明

## 配置文件说明

### 模板文件 (Git管理)
- `environment.prod.ts` - 生产环境配置模板
- `environment.dev.ts` - 开发环境配置模板

### 实际配置文件 (不提交Git)
- `environment.ts` - 实际项目使用的配置文件 (已在 .gitignore 中)

## 部署配置

### 本地开发环境
```bash
# 复制开发环境模板
cp environment.dev.ts environment.ts
# 启动项目
npm run dev
```

### 生产环境部署
```bash
# 复制生产环境模板
cp environment.prod.ts environment.ts
# 启动项目
npm run prod
```

## 注意事项
- `environment.ts` 文件不会被提交到 Git 仓库
- 每个环境需要单独创建自己的 `environment.ts` 文件
- 修改配置模板时，记得同步更新实际环境的配置文件