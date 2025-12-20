# 阶段1：构建Angular前端（Node 20满足Angular 18的版本要求）
FROM node:20-alpine as build-stage
WORKDIR /app

# 复制前端依赖文件
COPY package*.json ./

# 安装前端依赖（解决Angular 18的peer依赖冲突）
RUN npm install --legacy-peer-deps

# 复制所有前端文件（包括scripts/优化脚本）
COPY . .

# 执行生产优化构建（对应package.json的build:optimized）
RUN npm run build:optimized

# 阶段2：Nginx部署（轻量Alpine镜像）
FROM nginx:alpine as production-stage

# 复制构建好的前端静态文件到Nginx默认目录
COPY --from=build-stage /app/dist/quote-online-client /usr/share/nginx/html

# 复制自定义Nginx配置（替换容器默认配置）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 设置静态文件权限（解决Linux权限问题）
RUN chmod -R 755 /usr/share/nginx/html

# 暴露80/443端口（HTTPS/HTTP）
EXPOSE 80 443

# 启动Nginx（前台运行，保证容器不退出）
CMD ["nginx", "-g", "daemon off;"]