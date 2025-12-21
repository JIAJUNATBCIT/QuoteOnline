# 基于Node 20 Alpine（轻量，满足Angular 18后端依赖）
FROM node:20-alpine

# 安装必要的系统依赖（Alpine中npm全局安装可能需要）
RUN apk add --no-cache bash

# 安装PM2（全局，添加--unsafe-perm解决Alpine权限问题）
RUN npm install pm2 -g --unsafe-perm

# 验证PM2安装（调试：查看pm2-runtime路径和版本）
RUN which pm2-runtime && pm2-runtime -v

# 设置容器内工作目录（对应PM2的cwd）
WORKDIR /app

# 先复制依赖文件（利用Docker缓存，加快构建）
COPY package*.json ./

# 安装后端依赖（添加--legacy-peer-deps解决peer依赖冲突）
RUN npm install --legacy-peer-deps

# 复制所有后端代码（包括ecosystem.config.js）
COPY . .

# 验证ecosystem.config.js是否存在（调试：确保文件在工作目录）
RUN ls -l ./ecosystem.config.js || echo "⚠️ ecosystem.config.js文件不存在！"

# 创建日志和上传目录，并设置权限（解决Linux容器权限问题）
RUN mkdir -p ./logs ./uploads \
    && chmod -R 755 ./logs ./uploads \
    && chown -R node:node ./logs ./uploads

# 切换为node用户（非root运行，更安全）
USER node

# 暴露后端端口（对应PM2的PORT=3000）
EXPOSE 3000

# 修正：用绝对路径执行pm2-runtime（避免PATH问题），并确认命令格式
CMD ["/usr/local/bin/pm2-runtime", "ecosystem.config.js", "--env", "production"]