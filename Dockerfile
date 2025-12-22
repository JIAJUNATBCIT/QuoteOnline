# 基于 Node 20 Alpine 轻量镜像
FROM node:20-alpine

# 安装必要系统依赖（如 bash 用于脚本执行，curl 用于健康检查）
RUN apk add --no-cache bash curl

# 设置工作目录
WORKDIR /app

# 提前创建日志和上传目录，赋予 node 用户权限（解决写入权限问题）
RUN mkdir -p /app/logs /app/uploads \
    && chmod -R 775 /app/logs /app/uploads \
    && chown -R node:node /app/logs /app/uploads

# 复制依赖文件（利用 Docker 缓存，加快构建）
COPY package*.json ./

# 安装生产依赖（--production 忽略 devDependencies，如 nodemon、concurrently）
RUN npm install --legacy-peer-deps --production

# 复制所有项目代码（包括 server.js）
COPY . .

# 切换为 node 用户（安全最佳实践，避免 root 运行）
USER node

# 暴露端口（与 package.json 中后端运行端口一致，默认为 3000）
EXPOSE 3000

# 核心：启动命令（可选两种方式，推荐第二种）
# 方式1：直接执行 node server.js（最简洁，对应 package.json 的 "start" 脚本）
# CMD ["node", "server.js"]

# 方式2：通过 npm run start:prod 启动（与 package.json 脚本一致，更易维护）
CMD ["npm", "run", "start:prod"]