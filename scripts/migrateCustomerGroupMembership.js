/**
 * 数据迁移脚本：为现有用户添加customerGroupMembership数据
 * 运行方式：node scripts/migrateCustomerGroupMembership.js
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const CustomerGroup = require('../models/CustomerGroup');
require('dotenv').config();

async function migrateCustomerGroupMembership() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/quote_online');
    console.log('已连接到数据库');

    // 获取所有有客户群组的用户
    const usersWithGroups = await User.find({ 
      customerGroups: { $exists: true, $ne: [] },
      'customerGroupMembership.0': { $exists: false } // 还没有membership数据的用户
    });

    console.log(`找到 ${usersWithGroups.length} 个用户需要迁移`);

    let updatedCount = 0;

    for (const user of usersWithGroups) {
      try {
        // 为每个客户群组创建membership记录
        const membershipData = user.customerGroups.map(groupId => ({
          customerGroup: groupId,
          joinedAt: user.createdAt || new Date(), // 使用用户创建时间作为加入时间
          isActive: true,
          leftAt: null
        }));

        // 更新用户文档
        await User.updateOne(
          { _id: user._id },
          { 
            $set: { customerGroupMembership: membershipData }
          }
        );

        updatedCount++;
        console.log(`已更新用户: ${user.name || user.email} (${user.customerGroups.length} 个群组)`);
      } catch (error) {
        console.error(`更新用户 ${user.name || user.email} 失败:`, error.message);
      }
    }

    console.log(`\n迁移完成！成功更新了 ${updatedCount} 个用户`);

    // 验证迁移结果
    const totalUsers = await User.countDocuments();
    const usersWithMembership = await User.countDocuments({ 
      'customerGroupMembership.0': { $exists: true } 
    });
    
    console.log(`统计信息：`);
    console.log(`- 总用户数: ${totalUsers}`);
    console.log(`- 有membership数据的用户数: ${usersWithMembership}`);

  } catch (error) {
    console.error('迁移过程中发生错误:', error);
  } finally {
    await mongoose.connection.close();
    console.log('数据库连接已关闭');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateCustomerGroupMembership();
}

module.exports = migrateCustomerGroupMembership;