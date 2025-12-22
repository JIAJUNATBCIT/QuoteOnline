FROM nginx:alpine

# 可选：添加自定义Nginx配置优化
RUN sed -i 's/worker_processes auto/worker_processes 1/g' /etc/nginx/nginx.conf \
    && rm -rf /etc/nginx/conf.d/default.conf  # 删除默认配置

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]