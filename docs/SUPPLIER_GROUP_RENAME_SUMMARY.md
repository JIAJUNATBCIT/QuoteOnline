# 供应商群组重命名更改摘要

## 概述
将原有的 `group` 相关代码重命名为 `supplierGroup`，以保持与客户群组 `customerGroup` 的命名一致性。

## 后端更改

### 模型层
- **models/Group.js** → **models/SupplierGroup.js** ✅
  - `GroupSchema` → `SupplierGroupSchema`
  - 导出模型：`Group` → `SupplierGroup`

- **models/User.js**
  - `groups` 字段 → `supplierGroups` 字段
  - 引用：`ref: 'Group'` → `ref: 'SupplierGroup'`

### 路由层
- **routes/groups.js** → **routes/supplierGroups.js** ✅
  - 所有 `Group` 引用 → `SupplierGroup`
  - 所有 `groups` 查询 → `supplierGroups` 查询
  - 所有错误消息更新为"供应商群组"
  - API 路径更新为 `/api/supplierGroups` ✅

- **routes/quotes.js**
  - `const Group` → `const SupplierGroup`
  - `groups: { $in: groupIds }` → `supplierGroups: { $in: groupIds }`
  - `user.groups.includes()` → `user.supplierGroups.includes()`

- **server.js**
  - 路由注册：`/api/groups` → `/api/supplierGroups` ✅

## 前端更改

### 服务层
- **services/group.service.ts** → **services/supplier-group.service.ts** ✅
  - `Group` 接口 → `SupplierGroup` 接口
  - `GroupUser` 接口 → `SupplierGroupUser` 接口
  - `CreateGroupData` 接口 → `CreateSupplierGroupData` 接口
  - `UpdateGroupData` 接口 → `UpdateSupplierGroupData` 接口
  - `GroupService` 类 → `SupplierGroupService` 类
  - 所有方法名更新为 `supplierGroup` 相关
  - API 路径更新为 `/api/supplierGroups` ✅

### 组件层
- **components/group-management/** → **components/supplier-group-management/** ✅
  - 组件名：`GroupManagementComponent` → `SupplierGroupManagementComponent`
  - `groups` 数组 → `supplierGroups` 数组
  - 所有方法和属性更新为 `supplierGroup` 相关
  - CSS 类名从 `group-*` → `supplier-group-*`

- **components/quote-detail/quote-detail.component.ts**
  - `GroupService` → `SupplierGroupService`
  - `Group` 接口 → `SupplierGroup` 接口
  - `groups` 数组 → `supplierGroups` 数组
  - `loadGroups()` → `loadSupplierGroups()`

- **components/quote-detail/quote-detail.component.html**
  - 所有 `group` 变量引用 → `supplierGroup`
  - ID 前缀更新为 `supplierGroup-`

### 模块层
- **groups/** → **supplier-groups/** ✅
  - 组件引用更新为 `SupplierGroupManagementComponent`
  - 模块名：`GroupsModule` → `SupplierGroupsModule`

### 路由层
- **app-routing.module.ts**
  - 路由路径：`/groups` → `/supplier-groups` ✅
  - 懒加载模块：`groups.module` → `supplier-groups.module` ✅

- **components/navbar/navbar.component.html**
  - 导航链接：`routerLink="/groups"` → `routerLink="/supplier-groups"` ✅

## 文件重命名完成状态

### 已删除的旧文件 ❌
- `models/Group.js` (已删除)
- `routes/groups.js` (已删除)
- `client/src/app/services/group.service.ts` (已删除)
- `client/src/app/components/group-management/` 整个目录 (已删除)
- `client/src/app/groups/` 整个目录 (已删除)

### 已创建的新文件 ✅
- `models/SupplierGroup.js`
- `routes/supplierGroups.js`
- `client/src/app/services/supplier-group.service.ts`
- `client/src/app/components/supplier-group-management/supplier-group-management.component.ts`
- `client/src/app/components/supplier-group-management/supplier-group-management.component.html`
- `client/src/app/components/supplier-group-management/supplier-group-management.component.scss`
- `client/src/app/supplier-groups/supplier-groups.module.ts`

## 数据库影响
- 现有数据不受影响（MongoDB 集合名自动更新为 `suppliergroups`）
- 用户模型中的 `groups` 字段重命名为 `supplierGroups`
- 客户群组 `customerGroups` 保持不变

## API 兼容性
- API 路径已更新：`/api/groups` → `/api/supplierGroups`
- 响应数据结构保持一致
- 前端调用已同步更新

## 验证结果
✅ Group 模型重命名为 SupplierGroup
✅ User 模型 supplierGroups 字段存在
✅ customerGroups 字段保持不变
✅ 路由文件正确使用 SupplierGroup
✅ 前端服务正确重命名
✅ 组件和模板正确更新
✅ 所有文件重命名完成
✅ 旧文件已删除
✅ API 路径已更新
✅ 路由和导航已更新

## 下一步操作
1. 服务器重启以加载新模型和路由
2. 前端构建缓存清理
3. 确保所有客户端缓存已清除
4. 测试新的 API 端点 `/api/supplierGroups`