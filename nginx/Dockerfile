# ===============================
# 阶段1：构建 Angular 前端
# ===============================
FROM node:20-alpine as build-stage

WORKDIR /app

# 复制前端依赖文件
COPY client/package*.json ./

# 安装前端依赖
RUN npm install --legacy-peer-deps

# 复制前端源码
COPY client/ ./

# 构建 Angular 生产包
RUN npm run build:optimized

# ===============================
# 阶段2：Nginx 部署
# ===============================
FROM nginx:alpine as production-stage

# 复制构建好的前端静态文件
COPY --from=build-stage /app/dist/quote-online-client /usr/share/nginx/html

# 复制自定义 Nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 设置静态文件权限
RUN chmod -R 755 /usr/share/nginx/html

# 暴露端口
EXPOSE 80 443

# 前台启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
