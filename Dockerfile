# 基于Node 20 Alpine（轻量，满足Angular 18后端依赖）
FROM node:20-alpine

# 安装必要的系统依赖
RUN apk add --no-cache bash

# 安装PM2（全局，解决Alpine权限问题）
RUN npm install pm2 -g --unsafe-perm

# 设置工作目录
WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装后端依赖（仅安装生产依赖，加快构建）
RUN npm install --legacy-peer-deps --production

# 复制所有后端代码（包括ecosystem.config.js和server.js）
COPY . .

# 创建日志和上传目录，并设置权限
RUN mkdir -p ./logs ./uploads \
    && chmod -R 755 ./logs ./uploads \
    && chown -R node:node ./logs ./uploads

# 切换为node用户
USER node

# 暴露端口
EXPOSE 3000

# 用绝对路径执行pm2-runtime，避免PATH问题
CMD ["/usr/local/bin/pm2-runtime", "ecosystem.config.js", "--env", "production"]