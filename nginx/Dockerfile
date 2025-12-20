# ===============================
# 阶段1：构建 Angular 前端
# ===============================
FROM node:20-alpine as build-stage

WORKDIR /app

# 复制前端依赖文件
COPY ../client/package*.json ./

# 安装前端依赖
RUN npm install --legacy-peer-deps

# 复制前端源码
COPY ../client/ ./

# 执行生产构建
RUN npm run build:optimized

# ===============================
# 阶段2：Nginx 部署
# ===============================
FROM nginx:alpine as production-stage

# 复制前端构建好的文件
COPY --from=build-stage /app/dist/quote-online-client /usr/share/nginx/html

# 复制 nginx.conf（client 下）
COPY ../client/nginx.conf /etc/nginx/conf.d/default.conf

# 设置权限
RUN chmod -R 755 /usr/share/nginx/html

# 暴露端口
EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
