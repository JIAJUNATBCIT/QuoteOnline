# 基于Node 20 Alpine（轻量，满足Angular 18后端依赖）
FROM node:20-alpine

# 安装必要的系统依赖
RUN apk add --no-cache bash

# 设置工作目录
WORKDIR /app

# 提前创建日志和上传目录（绝对路径，确保权限）
RUN mkdir -p /app/logs /app/uploads \
    && chmod -R 775 /app/logs /app/uploads \
    && chown -R node:node /app/logs /app/uploads

# 复制依赖文件（利用Docker缓存，加快构建）
COPY package*.json ./

# 安装后端依赖（生产依赖）
RUN npm install --legacy-peer-deps --production

# 复制所有后端代码
COPY . .

# 切换为node用户（安全最佳实践）
USER node

# 暴露端口
EXPOSE 3000

# 核心：直接用node命令启动应用入口文件（替换PM2）
# 注意：将server.js改为你的实际入口文件（如app.js、index.js）
CMD ["node", "server.js"]