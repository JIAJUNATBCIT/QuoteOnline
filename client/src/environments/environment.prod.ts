// 生产环境配置模板
// 部署时复制此内容到 client/environment.ts
export const environment = {
  production: true,
  apiUrl: '/api',
  uploadUrl: '/api/uploads',
  maxFileSize: 10485760,
  maxFilesCount: 10,
  allowedFileExtensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png'],
  version: '2025-12-11-prod'
};