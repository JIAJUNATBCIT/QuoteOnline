const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// 获取所有群组
router.get('/', auth, async (req, res) => {
  try {
    const groups = await Group.find({ isActive: true })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    // 为每个群组获取用户信息
    const groupsWithUsers = await Promise.all(
      groups.map(async (group) => {
        const users = await User.find({ 
          groups: group._id,
          role: 'supplier',
          isActive: true 
        }).select('name email company');
        
        return {
          ...group.toObject(),
          users
        };
      })
    );

    res.json(groupsWithUsers);
  } catch (error) {
    console.error('获取群组失败:', error);
    res.status(500).json({ message: '获取群组失败' });
  }
});

// 创建群组
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 检查群组名是否已存在
    const existingGroup = await Group.findOne({ name });
    if (existingGroup) {
      return res.status(400).json({ message: '群组名已存在' });
    }

    const group = new Group({
      name,
      description,
      color: color || '#007bff',
      createdBy: req.user.userId
    });

    await group.save();
    await group.populate('createdBy', 'name email');
    
    res.status(201).json(group);
  } catch (error) {
    console.error('创建群组失败:', error);
    res.status(500).json({ message: '创建群组失败' });
  }
});

// 更新群组
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, color, isActive } = req.body;
    
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 如果更改名称，检查是否与其他群组冲突
    if (name && name !== group.name) {
      const existingGroup = await Group.findOne({ name });
      if (existingGroup) {
        return res.status(400).json({ message: '群组名已存在' });
      }
    }

    // 更新字段
    if (name) group.name = name;
    if (description !== undefined) group.description = description;
    if (color) group.color = color;
    if (isActive !== undefined) group.isActive = isActive;

    await group.save();
    await group.populate('createdBy', 'name email');
    
    res.json(group);
  } catch (error) {
    console.error('更新群组失败:', error);
    res.status(500).json({ message: '更新群组失败' });
  }
});

// 删除群组
router.delete('/:id', auth, async (req, res) => {
  try {
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 检查是否有用户使用此群组
    const usersWithGroup = await User.find({ groups: group._id });
    if (usersWithGroup.length > 0) {
      return res.status(400).json({ 
        message: '无法删除群组，仍有用户使用此群组',
        users: usersWithGroup.map(u => u.name)
      });
    }

    await Group.findByIdAndDelete(req.params.id);
    res.json({ message: '群组删除成功' });
  } catch (error) {
    console.error('删除群组失败:', error);
    res.status(500).json({ message: '删除群组失败' });
  }
});

// 获取群组详情（包含用户）
router.get('/:id', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('createdBy', 'name email');
    
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 获取属于此群组的用户
    const users = await User.find({ 
      groups: group._id,
      role: 'supplier',
      isActive: true 
    }).select('name email company');

    res.json({
      ...group.toObject(),
      users
    });
  } catch (error) {
    console.error('获取群组详情失败:', error);
    res.status(500).json({ message: '获取群组详情失败' });
  }
});

// 分配用户到群组
router.post('/:id/users', auth, async (req, res) => {
  try {
    const { userIds } = req.body;
    
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    // 验证用户都是供应商
    const users = await User.find({ 
      _id: { $in: userIds },
      role: 'supplier'
    });

    if (users.length !== userIds.length) {
      return res.status(400).json({ message: '只能分配供应商用户到群组' });
    }

    // 将用户添加到群组
    await User.updateMany(
      { _id: { $in: userIds } },
      { $addToSet: { groups: group._id } }
    );

    res.json({ message: '用户分配成功' });
  } catch (error) {
    console.error('分配用户到群组失败:', error);
    res.status(500).json({ message: '分配用户到群组失败' });
  }
});

// 从群组移除用户
router.delete('/:id/users/:userId', auth, async (req, res) => {
  try {
    // 检查权限
    if (!req.user.role || !['admin', 'quoter'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const group = await Group.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ message: '群组不存在' });
    }

    await User.updateOne(
      { _id: req.params.userId },
      { $pull: { groups: group._id } }
    );

    res.json({ message: '用户移除成功' });
  } catch (error) {
    console.error('从群组移除用户失败:', error);
    res.status(500).json({ message: '从群组移除用户失败' });
  }
});

module.exports = router;