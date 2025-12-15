const express = require('express');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();

// Get all users (admin only) or get customers for customer group assignment (quoter or admin)
router.get('/', auth, async (req, res) => {
  try {
    const { forCustomerGroup } = req.query;
    
    // 检查权限
    if (!['quoter', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }
    
    // 如果是客户群组分配场景，只返回客户用户
    if (forCustomerGroup === 'true') {
      const users = await User.find({ role: 'customer', isActive: true }).select('-password').sort({ name: 1 });
      return res.json(users);
    }
    
    // 其他情况（用户管理），只有管理员可以获取所有用户
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '权限不足' });
    }
    
    // 管理员获取所有用户
    const users = await User.find().select('-password').sort({ name: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Get suppliers (quoter or admin only)
router.get('/suppliers', auth, async (req, res) => {
  try {
    // 验证权限：只有报价员和管理员可以获取供应商列表
    if (!['quoter', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const suppliers = await User.find({ role: 'supplier', isActive: true })
      .select('-password')
      .sort({ name: 1 });
    
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Get user by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }
    
    // Customers can only see their own info
    if (req.user.role === 'customer' && req.user.userId !== req.params.id) {
      return res.status(403).json({ message: '权限不足' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Update user role (admin only)
router.patch('/:id/role', auth, authorize('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!['customer', 'quoter', 'supplier', 'admin'].includes(role)) {
      return res.status(400).json({ message: '无效的角色' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Update user password (admin only)
router.patch('/:id/password', auth, authorize('admin'), async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: '新密码至少需要6个字符' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 管理员不能修改自己的密码，应该使用专门的修改密码接口
    if (req.user.userId === req.params.id) {
      return res.status(400).json({ message: '管理员不能通过此接口修改自己的密码，请使用个人密码修改功能' });
    }

    // 更新密码
    user.password = newPassword;
    await user.save();

    res.json({ message: '密码修改成功' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Update user profile
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, company, phone } = req.body;
    
    // Customers can only update their own profile
    if (req.user.role === 'customer' && req.user.userId !== req.params.id) {
      return res.status(403).json({ message: '权限不足' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, company, phone },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Delete user (admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json({ message: '用户删除成功' });
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;