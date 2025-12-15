const express = require('express');
const router = express.Router();
const CustomerGroup = require('../models/CustomerGroup');
const User = require('../models/User');
const Quote = require('../models/Quote');
const { auth } = require('../middleware/auth');
const PermissionUtils = require('../utils/permissionUtils');

// 获取所有客户群组
router.get('/', auth, PermissionUtils.hasRole(['admin', 'quoter']), async (req, res) => {
  try {
    const customerGroups = await CustomerGroup.find({ isActive: true })
      .populate('createdBy', 'name email')
      .populate('customers', 'name email company')
      .sort({ createdAt: -1 });

    res.json(customerGroups);
  } catch (error) {
    console.error('获取客户群组失败:', error);
    res.status(500).json({ error: '获取客户群组失败' });
  }
});

// 获取单个客户群组详情
router.get('/:id', auth, PermissionUtils.hasRole(['admin', 'quoter']), async (req, res) => {
  try {
    const customerGroup = await CustomerGroup.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('customers', 'name email company');

    if (!customerGroup) {
      return res.status(404).json({ error: '客户群组不存在' });
    }

    res.json(customerGroup);
  } catch (error) {
    console.error('获取客户群组详情失败:', error);
    res.status(500).json({ error: '获取客户群组详情失败' });
  }
});

// 创建客户群组
router.post('/', auth, PermissionUtils.hasRole(['admin', 'quoter']), async (req, res) => {
  try {
    const { name, description, color } = req.body;

    // 检查群组名称是否已存在
    const existingGroup = await CustomerGroup.findOne({ name: name.trim() });
    if (existingGroup) {
      return res.status(400).json({ error: '客户群组名称已存在' });
    }

    const customerGroup = new CustomerGroup({
      name: name.trim(),
      description: description?.trim() || '',
      color: color || '#28a745',
      createdBy: req.user.userId
    });

    await customerGroup.save();
    await customerGroup.populate('createdBy', 'name email');

    console.log(`客户群组创建成功: ${customerGroup.name} by ${req.user.email}`);
    res.status(201).json(customerGroup);
  } catch (error) {
    console.error('创建客户群组失败:', error);
    res.status(500).json({ error: '创建客户群组失败' });
  }
});

// 更新客户群组
router.put('/:id', auth, PermissionUtils.hasRole(['admin', 'quoter']), async (req, res) => {
  try {
    const { name, description, color, isActive } = req.body;
    const customerGroup = await CustomerGroup.findById(req.params.id);

    if (!customerGroup) {
      return res.status(404).json({ error: '客户群组不存在' });
    }

    // 检查名称是否被其他群组使用
    if (name && name.trim() !== customerGroup.name) {
      const existingGroup = await CustomerGroup.findOne({ 
        name: name.trim(), 
        _id: { $ne: req.params.id } 
      });
      if (existingGroup) {
        return res.status(400).json({ error: '客户群组名称已存在' });
      }
    }

    // 更新字段
    if (name) customerGroup.name = name.trim();
    if (description !== undefined) customerGroup.description = description.trim();
    if (color) customerGroup.color = color;
    if (isActive !== undefined) customerGroup.isActive = isActive;

    await customerGroup.save();
    await customerGroup.populate('createdBy', 'name email');
    await customerGroup.populate('customers', 'name email company');

    console.log(`客户群组更新成功: ${customerGroup.name} by ${req.user.email}`);
    res.json(customerGroup);
  } catch (error) {
    console.error('更新客户群组失败:', error);
    res.status(500).json({ error: '更新客户群组失败' });
  }
});

// 删除客户群组
router.delete('/:id', auth, PermissionUtils.hasRole(['admin', 'quoter']), async (req, res) => {
  try {
    const customerGroup = await CustomerGroup.findById(req.params.id);

    if (!customerGroup) {
      return res.status(404).json({ error: '客户群组不存在' });
    }

    // 检查是否有客户使用此客户群组
    const usersWithCustomerGroup = await User.find({ customerGroups: customerGroup._id });
    if (usersWithCustomerGroup.length > 0) {
      return res.status(400).json({ 
        error: '无法删除客户群组，仍有客户使用此群组',
        users: usersWithCustomerGroup.map(u => u.name)
      });
    }

    // 物理删除：从数据库删除
    await CustomerGroup.findByIdAndDelete(req.params.id);

    console.log(`客户群组删除成功: ${customerGroup.name} by ${req.user.email}`);
    res.json({ message: '客户群组删除成功' });
  } catch (error) {
    console.error('删除客户群组失败:', error);
    res.status(500).json({ error: '删除客户群组失败' });
  }
});

// 分配客户到群组
router.post('/:id/customers', auth, PermissionUtils.hasRole(['admin', 'quoter']), async (req, res) => {
  try {
    const { customerIds } = req.body;
    
    if (!Array.isArray(customerIds)) {
      return res.status(400).json({ error: '客户ID列表格式不正确' });
    }

    const customerGroup = await CustomerGroup.findById(req.params.id);
    if (!customerGroup) {
      return res.status(404).json({ error: '客户群组不存在' });
    }

    // 验证所有用户都是客户角色
    const customers = await User.find({ 
      _id: { $in: customerIds },
      role: 'customer'
    });

    if (customers.length !== customerIds.length) {
      return res.status(400).json({ error: '只能分配客户到客户群组' });
    }

    // 获取当前群组中的客户ID
    const currentCustomerIds = customerGroup.customers.map(customer => customer.toString());
    
    // 需要添加的客户（在customerIds中但不在当前群组中）
    const customersToAdd = customerIds.filter(id => !currentCustomerIds.includes(id));
    
    // 需要移除的客户（在当前群组中但不在customerIds中）
    const customersToRemove = currentCustomerIds.filter(id => !customerIds.includes(id));

    // 添加新客户到群组
    if (customersToAdd.length > 0) {
      customerGroup.customers.push(...customersToAdd);
      
      // 更新用户的customerGroups字段
      await User.updateMany(
        { _id: { $in: customersToAdd } },
        { 
          $addToSet: { customerGroups: customerGroup._id },
          $push: {
            customerGroupMembership: {
              customerGroup: customerGroup._id,
              joinedAt: new Date(),
              isActive: true
            }
          }
        }
      );
    }

    // 从群组中移除客户
    if (customersToRemove.length > 0) {
      customerGroup.customers = customerGroup.customers.filter(
        customer => !customersToRemove.includes(customer.toString())
      );
      
      // 标记membership为非活跃，记录离开时间
      await User.updateMany(
        { _id: { $in: customersToRemove } },
        { 
          $pull: { customerGroups: customerGroup._id },
          $set: {
            'customerGroupMembership.$[elem].isActive': false,
            'customerGroupMembership.$[elem].leftAt': new Date()
          }
        },
        {
          arrayFilters: [
            { 'elem.customerGroup': customerGroup._id, 'elem.isActive': true }
          ]
        }
      );
      
      // 从该客户创建的询价单中移除此群组ID
      await Quote.updateMany(
        {
          customer: { $in: customersToRemove },
          customerGroups: customerGroup._id
        },
        { $pull: { customerGroups: customerGroup._id } }
      );
    }

    await customerGroup.save();
    await customerGroup.populate('customers', 'name email company');

    console.log(`更新群组成员: 添加 ${customersToAdd.length} 个客户, 移除 ${customersToRemove.length} 个客户 - ${customerGroup.name}`);
    res.json(customerGroup);
  } catch (error) {
    console.error('分配客户到群组失败:', error);
    res.status(500).json({ error: '分配客户到群组失败' });
  }
});

// 从群组移除客户
router.delete('/:id/customers/:customerId', auth, PermissionUtils.hasRole(['admin', 'quoter']), async (req, res) => {
  try {
    const { id, customerId } = req.params;

    const customerGroup = await CustomerGroup.findById(id);
    if (!customerGroup) {
      return res.status(404).json({ error: '客户群组不存在' });
    }

    // 从群组中移除客户
    customerGroup.customers = customerGroup.customers.filter(
      customer => customer.toString() !== customerId
    );
    await customerGroup.save();

    // 标记membership为非活跃，记录离开时间
    await User.updateOne(
      { _id: customerId },
      { 
        $pull: { customerGroups: id },
        $set: {
          'customerGroupMembership.$[elem].isActive': false,
          'customerGroupMembership.$[elem].leftAt': new Date()
        }
      },
      {
        arrayFilters: [
          { 'elem.customerGroup': id, 'elem.isActive': true }
        ]
      }
    );
    
    // 从该客户创建的询价单中移除此群组ID
    await Quote.updateMany(
      {
        customer: customerId,
        customerGroups: id
      },
      { $pull: { customerGroups: id } }
    );

    await customerGroup.populate('customers', 'name email company');

    console.log(`从群组 ${customerGroup.name} 移除客户: ${customerId}`);
    res.json(customerGroup);
  } catch (error) {
    console.error('从群组移除客户失败:', error);
    res.status(500).json({ error: '从群组移除客户失败' });
  }
});

module.exports = router;