# 基于Node 20 Alpine（轻量，满足Angular 18后端依赖）
FROM node:20-alpine

# 安装PM2（全局，与生产环境一致）
RUN npm install pm2 -g

# 设置容器内工作目录（对应PM2的cwd）
WORKDIR /app

# 先复制依赖文件（利用Docker缓存，加快构建）
# 复制文件或目录从构建上下文到容器文件系统
# 参数:
#   <src> - 构建上下文中的源文件或目录路径(支持通配符)
#   <dest> - 容器内的目标路径(绝对路径或相对于WORKDIR的路径)
# 注意:
#   - <src>路径必须在构建上下文内
#   - 如果<dest>不存在会自动创建
#   - 如果<src>是目录，会复制目录内容(不包括目录本身)
#   - 支持--chown参数设置文件所有权(格式: <user>:<group>)
#   - 支持--from参数从其他构建阶段复制文件
COPY package*.json ./

# 安装后端依赖（添加--legacy-peer-deps解决peer依赖冲突）
RUN npm install --legacy-peer-deps

# 复制所有后端代码
COPY . .

# 创建日志和上传目录，并设置权限（解决Linux容器权限问题）
RUN mkdir -p ./logs ./uploads \
    && chmod -R 755 ./logs ./uploads \
    && chown -R node:node ./logs ./uploads

# 切换为node用户（非root运行，更安全）
USER node

# 暴露后端端口（对应PM2的PORT=3000）
EXPOSE 3000

# 用PM2运行时启动（匹配ecosystem.config.js的生产环境）
CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]