const express = require('express');
const router = express.Router();
const SupplierGroup = require('../models/SupplierGroup');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// 获取所有供应商群组
router.get('/', auth, async (req, res) => {
  try {
    const supplierGroups = await SupplierGroup.find({})
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // 为每个供应商群组获取用户信息
    const supplierGroupsWithUsers = await Promise.all(
      supplierGroups.map(async (supplierGroup) => {
        const users = await User.find({ 
          supplierGroups: supplierGroup._id,
          role: 'supplier',
          isActive: true 
        }).select('name email company');
        
        return {
          ...supplierGroup.toObject(),
          users
        };
      })
    );

    res.json(supplierGroupsWithUsers);
  } catch (error) {
    console.error('获取供应商群组失败:', error);
    res.status(500).json({ message: '获取供应商群组失败' });
  }
});

// 创建供应商群组
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 检查供应商群组名是否已存在
    const existingSupplierGroup = await SupplierGroup.findOne({ name });
    if (existingSupplierGroup) {
      return res.status(400).json({ message: '供应商群组名已存在' });
    }

    const supplierGroup = new SupplierGroup({
      name,
      description,
      color: color || '#007bff',
      createdBy: req.user.userId
    });

    await supplierGroup.save();
    await supplierGroup.populate('createdBy', 'name email');
    
    res.status(201).json(supplierGroup);
  } catch (error) {
    console.error('创建供应商群组失败:', error);
    res.status(500).json({ message: '创建供应商群组失败' });
  }
});

// 更新供应商群组
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, color, isActive } = req.body;
    
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const supplierGroup = await SupplierGroup.findById(req.params.id);
    if (!supplierGroup) {
      return res.status(404).json({ message: '供应商群组不存在' });
    }

    // 如果更改名称，检查是否与其他供应商群组冲突
    if (name && name !== supplierGroup.name) {
      const existingSupplierGroup = await SupplierGroup.findOne({ name });
      if (existingSupplierGroup) {
        return res.status(400).json({ message: '供应商群组名已存在' });
      }
    }

    // 更新字段
    if (name) supplierGroup.name = name;
    if (description !== undefined) supplierGroup.description = description;
    if (color) supplierGroup.color = color;
    if (isActive !== undefined) supplierGroup.isActive = isActive;

    await supplierGroup.save();
    await supplierGroup.populate('createdBy', 'name email');
    
    res.json(supplierGroup);
  } catch (error) {
    console.error('更新供应商群组失败:', error);
    res.status(500).json({ message: '更新供应商群组失败' });
  }
});

// 删除供应商群组
router.delete('/:id', auth, async (req, res) => {
  try {
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const supplierGroup = await SupplierGroup.findById(req.params.id);
    if (!supplierGroup) {
      return res.status(404).json({ message: '供应商群组不存在' });
    }

    // 检查是否有用户使用此供应商群组
    const usersWithSupplierGroup = await User.find({ supplierGroups: supplierGroup._id });
    if (usersWithSupplierGroup.length > 0) {
      return res.status(400).json({ 
        message: '无法删除供应商群组，仍有用户使用此群组',
        users: usersWithSupplierGroup.map(u => u.name)
      });
    }

    await SupplierGroup.findByIdAndDelete(req.params.id);
    res.json({ message: '供应商群组删除成功' });
  } catch (error) {
    console.error('删除供应商群组失败:', error);
    res.status(500).json({ message: '删除供应商群组失败' });
  }
});

// 获取供应商群组详情（包含用户）
router.get('/:id', auth, async (req, res) => {
  try {
    const supplierGroup = await SupplierGroup.findById(req.params.id)
      .populate('createdBy', 'name email');
    
    if (!supplierGroup) {
      return res.status(404).json({ message: '供应商群组不存在' });
    }

    // 获取属于此供应商群组的用户
    const users = await User.find({ 
      supplierGroups: supplierGroup._id,
      role: 'supplier',
      isActive: true 
    }).select('name email company');

    res.json({
      ...supplierGroup.toObject(),
      users
    });
  } catch (error) {
    console.error('获取供应商群组详情失败:', error);
    res.status(500).json({ message: '获取供应商群组详情失败' });
  }
});

// 分配用户到供应商群组（设置完整用户列表）
router.post('/:id/users', auth, async (req, res) => {
  try {
    const { userIds } = req.body;
    
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const supplierGroup = await SupplierGroup.findById(req.params.id);
    if (!supplierGroup) {
      return res.status(404).json({ message: '供应商群组不存在' });
    }

    // 验证用户都是供应商
    if (userIds && userIds.length > 0) {
      const users = await User.find({ 
        _id: { $in: userIds },
        role: 'supplier'
      });

      if (users.length !== userIds.length) {
        return res.status(400).json({ message: '只能分配供应商用户到供应商群组' });
      }
    }

    // 获取当前所有供应商
    const allSuppliers = await User.find({ role: 'supplier' }).select('_id');
    const allSupplierIds = allSuppliers.map(supplier => supplier._id.toString());

    // 移除所有供应商中的此供应商群组
    await User.updateMany(
      { _id: { $in: allSupplierIds } },
      { $pull: { supplierGroups: supplierGroup._id } }
    );

    // 将选中的用户添加到供应商群组
    if (userIds && userIds.length > 0) {
      await User.updateMany(
        { _id: { $in: userIds } },
        { $addToSet: { supplierGroups: supplierGroup._id } }
      );
    }

    res.json({ message: '供应商群组成员更新成功' });
  } catch (error) {
    console.error('更新供应商群组成员失败:', error);
    res.status(500).json({ message: '更新供应商群组成员失败' });
  }
});

// 从供应商群组移除用户
router.delete('/:id/users/:userId', auth, async (req, res) => {
  try {
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const supplierGroup = await SupplierGroup.findById(req.params.id);
    if (!supplierGroup) {
      return res.status(404).json({ message: '供应商群组不存在' });
    }

    await User.updateOne(
      { _id: req.params.userId },
      { $pull: { supplierGroups: supplierGroup._id } }
    );

    res.json({ message: '用户移除成功' });
  } catch (error) {
    console.error('从供应商群组移除用户失败:', error);
    res.status(500).json({ message: '从供应商群组移除用户失败' });
  }
});

module.exports = router;