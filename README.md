# 在线询价系统

一个基于 Node.js + MongoDB + Express + Angular + Bootstrap 的全栈在线询价系统。

## 功能特性

### 用户管理模块
- 用户角色：客户、报价员、管理员
- 邮箱+密码登录方式
- 用户注册默认为客户角色
- 管理员可以管理用户角色
- 忘记密码邮件找回功能

### 询价模块
- 客户登录后可上传Excel询价单
- 客户可输入留言并提交询价
- 询价通过邮件发送给报价员（Excel文件作为附件）
- 报价员可登录网站下载客户上传的Excel文件
- 报价员可上传报价用的Excel文件
- 客户只能查看、修改、删除自己创建的询价单
- 报价员可查看所有询价单

## 技术栈

### 后端
- Node.js
- Express.js
- MongoDB + Mongoose
- JWT认证
- Multer文件上传
- Mailgun邮件服务

### 前端
- Angular 16
- Bootstrap 5
- TypeScript
- RxJS

## 安装和运行

### 环境要求
- Node.js 16+
- MongoDB 4.4+
- Angular CLI 16+

### 安装步骤

1. 克隆项目
```bash
git clone <repository-url>
cd QuoteOnline
```

2. 安装后端依赖
```bash
npm install
```

3. 安装前端依赖
```bash
cd client
npm install
cd ..
```

4. 配置环境变量
```bash
cp .env.example .env
```
编辑 `.env` 文件，配置数据库连接和邮件服务。

5. 启动MongoDB服务

6. 运行项目
```bash
# 开发模式（同时启动前后端）
npm run dev

# 或者分别启动
npm run server  # 启动后端
npm run client  # 启动前端
```

7. 访问应用
- 前端：http://localhost:4200
- 后端API：http://localhost:3000

## 项目结构

```
QuoteOnline/
├── client/                 # Angular前端
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/ # 组件
│   │   │   ├── services/   # 服务
│   │   │   ├── guards/     # 路由守卫
│   │   │   └── interceptors/ # HTTP拦截器
│   │   └── environments/   # 环境配置
├── models/                 # MongoDB模型
├── routes/                 # Express路由
├── middleware/             # 中间件
├── services/               # 业务服务
├── uploads/                # 文件上传目录
├── server.js              # 服务器入口
└── package.json           # 项目配置
```

## API接口

### 认证相关
- POST /api/auth/register - 用户注册
- POST /api/auth/login - 用户登录
- GET /api/auth/me - 获取当前用户信息
- POST /api/auth/forgot-password - 忘记密码
- POST /api/auth/reset-password - 重置密码

### 用户管理
- GET /api/users - 获取所有用户（管理员）
- GET /api/users/:id - 获取用户详情
- PATCH /api/users/:id/role - 更新用户角色（管理员）
- PUT /api/users/:id - 更新用户信息
- DELETE /api/users/:id - 删除用户（管理员）

### 询价管理
- GET /api/quotes - 获取询价单列表
- POST /api/quotes - 创建询价单（客户）
- GET /api/quotes/:id - 获取询价单详情
- PUT /api/quotes/:id - 更新询价单
- PATCH /api/quotes/:id/assign - 分配询价单（管理员）
- GET /api/quotes/:id/download/:fileType - 下载文件

## 使用说明

### 客户使用流程
1. 注册账号（默认为客户角色）
2. 登录系统
3. 点击"创建询价单"
4. 填写询价信息并上传Excel文件
5. 提交询价，系统会自动发送邮件给报价员
6. 在"询价单"页面查看报价进度
7. 下载报价员提供的报价文件

### 报价员使用流程
1. 管理员将用户角色变更为报价员
2. 登录系统
3. 在"询价单"页面查看所有询价单
4. 下载客户上传的Excel文件
5. 处理询价并上传报价文件
6. 填写报价信息和留言

### 管理员使用流程
1. 登录系统
2. 在"用户管理"页面管理用户角色
3. 可以分配询价单给特定报价员
4. 拥有所有报价员的权限

## 开发说明

### 添加新功能
1. 后端：在相应目录添加模型、路由、服务
2. 前端：在相应目录添加组件、服务
3. 更新路由配置
4. 测试功能

### 部署说明
1. 构建前端：`npm run build`
2. 配置生产环境变量
3. 使用PM2等工具部署Node.js应用

## 许可证

MIT License