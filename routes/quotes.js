const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const Quote = require('../models/Quote');
const User = require('../models/User');
const Group = require('../models/Group');
const { auth, authorize } = require('../middleware/auth');
const emailService = require('../services/mailgunService');
const logger = require('../utils/logger');
const PermissionUtils = require('../utils/permissionUtils');
const router = express.Router();
const iconv = require('iconv-lite');


// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // 使用时间戳和随机数生成唯一文件名，避免冲突
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}_${randomSuffix}${ext}`);
  }
});



const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    fieldSize: 10 * 1024 * 1024, // 10MB field size limit
    files: 10 // 允许多个文件，最多10个
  },
  fileFilter: (req, file, cb) => {
    // 更严格的文件类型检查
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/excel'
    ];
    
    // 检查文件扩展名作为备用检查
    const allowedExtensions = ['.xlsx', '.xls'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`只支持Excel文件 (.xlsx, .xls)，当前文件: ${file.originalname} (${file.mimetype})`), false);
    }
  }
});





// 尝试把乱码文件名修复为 UTF-8 中文
function fixFileName(name) {
  if (!name) return name;

  // 如果本来就是纯 ASCII，就不动
  if (/^[\x00-\x7F]+$/.test(name)) return name;

  try {
    // 情况1：最常见 —— UTF-8 字节被当成 latin1 存进来了
    const buf = Buffer.from(name, 'latin1');
    const utf8 = buf.toString('utf8');

    // 如果转完后包含中文，就认为是正确的
    if (/[\u4e00-\u9fa5]/.test(utf8)) {
      return utf8;
    }



    return name;
  } catch (e) {
    return name;
  }
}

// Generate unique quote number
async function generateQuoteNumber() {
  const today = new Date();
  const year = String(today.getFullYear()).slice(-2); // 取年份后两位
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = year + month + day; // YYMMDD格式
  
  // Find the highest sequence number for today (使用索引优化查询)
  const todayPrefix = `Q${dateStr}`;
  const lastQuote = await Quote.findOne({ 
    quoteNumber: { $regex: `^${todayPrefix}` } 
  }).sort({ quoteNumber: -1 })
    .select('quoteNumber') // 只选择需要的字段
    .lean(); // 返回普通对象而不是Mongoose文档
  
  let sequence = 1;
  if (lastQuote) {
    // 从询价号中提取后两位数字
    const lastSequence = parseInt(lastQuote.quoteNumber.slice(-2));
    sequence = lastSequence + 1;
  }
  
  // 确保序号是2位数字，如果超过99则重置为01
  if (sequence > 99) {
    sequence = 1;
  }
  
  return `${todayPrefix}${String(sequence).padStart(2, '0')}`;
}



// Create quote (customer only)
router.post('/', auth, authorize('customer'), upload.fields([
  { name: 'customerFiles', maxCount: 10 }
]), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { title, description } = req.body;
    
    // 获取上传的文件
    const allFiles = req.files?.customerFiles || [];
    
    // 验证必填字段
    if (!allFiles || allFiles.length === 0) {
      return res.status(400).json({ message: '请上传Excel文件' });
    }

    // 如果没有提供标题，从第一个文件名生成
    let quoteTitle = title;
    if (!quoteTitle || quoteTitle.trim() === '') {
      const firstOriginalName = fixFileName(allFiles[0].originalname);
      const baseName = firstOriginalName.substring(0, firstOriginalName.lastIndexOf('.')) || firstOriginalName;
      quoteTitle = baseName;
    }

    logger.info(`开始创建询价单: ${title}`, { userId: req.user.userId, fileCount: allFiles.length });

    const dbStartTime = Date.now();
    const quoteNumber = await generateQuoteNumber();
    logger.database('生成询价号', 'quotes', { date: new Date() }, Date.now() - dbStartTime);

    // 处理多个客户文件
    const customerFiles = allFiles.map(file => {
      const originalNameFixed = fixFileName(file.originalname);
      return {
        filename: file.filename,
        originalName: originalNameFixed,
        path: file.path,
        size: file.size,
        uploadedAt: new Date()
      };
    });

    const quote = new Quote({
      quoteNumber,
      customer: req.user.userId,
      title: quoteTitle.trim(),
      description: description?.trim() || '',
      customerFiles: customerFiles
    });

    const saveStartTime = Date.now();
    await quote.save();
    await quote.populate('customer', 'name email company');
    logger.database('保存询价单', 'quotes', { quoteNumber: quote.quoteNumber }, Date.now() - saveStartTime);

    // 异步发送邮件通知报价员分配供应商，不阻塞响应
    setTimeout(async () => {
      try {
        const quoters = await User.find({ role: 'quoter', isActive: true })
          .select('email')
          .lean();
        
        if (quoters.length === 0) {
          logger.warn('没有找到活跃的报价员');
          return;
        }

        // 创建不包含客户信息的询价单对象用于邮件发送
        const sanitizedQuote = {
          _id: quote._id,
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          description: quote.description,
          createdAt: quote.createdAt,
          customerFiles: quote.customerFiles
          // 注意：不包含 customer 字段，保护客户隐私
        };

        // 避免重复发送，删除并行发送逻辑
        
        // 串行发送避免超时
        let successCount = 0;
        let failCount = 0;
        
        for (const quoter of quoters) {
          try {
            await Promise.race([
              emailService.sendQuoterAssignmentNotification(quoter.email, sanitizedQuote),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('邮件发送超时')), 45000)
              )
            ]);
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            failCount++;
            logger.error(`发送邮件给报价员 ${quoter.email} 失败`, { error: error.message });
          }
        }
        
        logger.info(`询价单 ${quote.quoteNumber} 报价员分配通知邮件发送完成`, { 
          successCount, 
          failCount, 
          totalQuoters: quoters.length 
        });
      } catch (error) {
        logger.error('批量发送报价员邮件失败', { error: error.message, stack: error.stack });
      }
    });

    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime);
    logger.info(`创建询价单响应完成: ${quote.quoteNumber}`, { totalTime: `${totalTime}ms` });

    res.status(201).json(quote);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime, error);
    
    // 根据错误类型返回不同的错误信息
    if (error.code === 11000) {
      // 重复键错误（询价号重复）
      return res.status(500).json({ message: '询价号生成冲突，请重试' });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: '数据验证失败', details: error.message });
    }
    
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Get all quotes
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    let populates = [];
    
    // 根据用户角色设置查询条件和populate
    switch (req.user.role) {
      case 'customer':
        query = { customer: req.user.userId };
        populates = [
          { path: 'customer', select: 'name email company' },
          { path: 'assignedGroups', select: 'name description color' }
        ];
        break;
      case 'supplier':
        // 获取供应商所在的群组
        const supplier = await User.findById(req.user.userId).select('groups');
        const supplierGroupIds = supplier ? supplier.groups : [];
        
        // 供应商可以看到：
        // 1. 直接分配给自己的询价单
        // 2. 分配给自己所在群组的询价单
        query = { 
          $or: [
            { supplier: req.user.userId },
            { assignedGroups: { $in: supplierGroupIds } }
          ]
        };
        populates = [
          { path: 'customer', select: 'name email company' },
          { path: 'supplier', select: 'name email company' },
          { path: 'assignedGroups', select: 'name description color' }
        ];
        break;
      case 'quoter':
      case 'admin':
        populates = [
          { path: 'customer', select: 'name email company' },
          { path: 'quoter', select: 'name email company' },
          { path: 'supplier', select: 'name email company' },
          { path: 'assignedGroups', select: 'name description color' }
        ];
        break;
    }
    
    // 执行查询
    let quotesQuery = Quote.find(query).sort({ createdAt: -1 });
    
    // 添加populate
    populates.forEach(populate => {
      quotesQuery = quotesQuery.populate(populate);
    });
    
    const quotes = await quotesQuery;
    
    // 过滤数据
    const filteredQuotes = quotes.map(quote => PermissionUtils.filterQuoteData(quote, req.user.role));
    
    res.json(filteredQuotes);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Get quote by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('customer', 'name email company')
      .populate('quoter', 'name email company')
      .populate('supplier', 'name email company')
      .populate('assignedGroups', 'name description color');

    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // 权限检查
    if (req.user.role === 'customer' && quote.customer._id.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 供应商权限检查：只能访问分配给自己的询价单或分配给所在群组的询价单
    if (req.user.role === 'supplier') {
      let hasAccess = false;
      
      // 检查是否被个人分配
      if (quote.supplier && quote.supplier._id.toString() === req.user.userId) {
        hasAccess = true;
      }
      
      // 检查是否属于已分配的群组
      if (!hasAccess && quote.assignedGroups && quote.assignedGroups.length > 0) {
        const user = await User.findById(req.user.userId);
        if (user && user.groups && user.groups.length > 0) {
          hasAccess = quote.assignedGroups.some(group => 
            user.groups.includes(group._id.toString())
          );
        }
      }
      
      if (!hasAccess) {
        return res.status(403).json({ message: '权限不足：您不是当前分配的供应商或群组成员' });
      }
      
      // 只有在特定状态下才能访问
      const allowedStatuses = ['in_progress', 'rejected', 'supplier_quoted', 'quoted'];
      if (!allowedStatuses.includes(quote.status)) {
        return res.status(403).json({ message: '权限不足：当前状态下不允许访问' });
      }
    }

    // 使用通用过滤函数处理数据
    const filteredQuote = PermissionUtils.filterQuoteData(quote, req.user.role);
    
    res.json(filteredQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Update quote (customer can update their own, quoter can update assigned, supplier can upload supplier file)
router.put('/:id', auth, upload.fields([
  { name: 'files', maxCount: 10 }
]), async (req, res) => {
  const startTime = Date.now();
  
  try {
    // 获取上传的文件
    const allFiles = req.files?.files || [];

    logger.info(`开始更新询价单: ${req.params.id}`, { 
      userId: req.user.userId, 
      userRole: req.user.role,
      hasFile: !!allFiles,
      fileCount: allFiles.length,
      requestBody: req.body
    });

    // 使用更高效的查询
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer' && quote.customer._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 报价员权限检查：允许未分配的报价员操作，或者已分配的报价员操作自己的询价单
    if (req.user.role === 'quoter' && quote.quoter && quote.quoter._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 供应商权限检查：允许上传或删除文件
    if (req.user.role === 'supplier') {
      const hasFileUpload = allFiles && allFiles.length > 0; // 正在上传文件
      const isDeletingFile = req.body.deleteSupplierFiles === 'true'; // 正在删除文件
      
      // 只有被分配的供应商才能上传文件
      if (quote.supplier && quote.supplier._id?.toString() !== req.user.userId) {
        return res.status(403).json({ message: '您未被分配到此询价单' });
      }
      
      // 只有在上传文件且状态不允许时才拒绝
      if (hasFileUpload && !['in_progress', 'rejected', 'supplier_quoted'].includes(quote.status)) {
        return res.status(403).json({ message: '该询价单当前状态不允许上传文件' });
      }
      
      // 只有在删除文件且不是文件所有者时才拒绝
      if (isDeletingFile && quote.supplier && quote.supplier._id?.toString() !== req.user.userId) {
        return res.status(403).json({ message: '权限不足' });
      }
    }

    const updateData = { ...req.body };
    
    // 处理 urgent 字段（字符串转布尔值）
    if (req.body.urgent !== undefined) {
      updateData.urgent = req.body.urgent === 'true';
    }
    
    // 处理特定文件索引删除
    if (req.body.deleteFileIndex !== undefined && req.body.deleteFileType) {
      const fileIndex = parseInt(req.body.deleteFileIndex);
      const fileType = req.body.deleteFileType;
      const fileArrayName = fileType + 'Files';
      
      // 检查文件删除权限
      if (!PermissionUtils.canDeleteFile(fileType, quote, req.user)) {
        return res.status(403).json({ message: '您没有权限删除此文件' });
      }
      
      if (quote[fileArrayName] && quote[fileArrayName].length > fileIndex) {
        // 删除指定索引的文件
        const updatedFiles = [...quote[fileArrayName]];
        const deletedFile = updatedFiles.splice(fileIndex, 1)[0];
        
        // 删除物理文件
        try {
          if (fs.existsSync(deletedFile.path)) {
            fs.unlinkSync(deletedFile.path);
            logger.info(`已删除物理文件: ${deletedFile.path}`);
          }
        } catch (error) {
          logger.error(`删除物理文件失败: ${deletedFile.path}`, error);
        }
        
        // 更新数据库中的文件数组
        updateData[fileArrayName] = updatedFiles;
        logger.info(`删除文件 ${deletedFile.originalName} (索引: ${fileIndex})`);
        
        // 如果删除的是供应商文件，且删除后没有文件了，且当前状态是"供应商已报价"，则回退到"处理中"
        if (fileType === 'supplier' && updatedFiles.length === 0 && quote.status === 'supplier_quoted') {
          updateData.status = 'in_progress';
          logger.info(`供应商删除最后一个文件，询价单状态从 supplier_quoted 回退到 in_progress`, {
            quoteId: req.params.id,
            userId: req.user.userId
          });
        }
        
        // 如果删除的是报价员文件，且删除后没有文件了，且当前状态是"已报价"，则根据条件回退状态
        if (fileType === 'quoter' && updatedFiles.length === 0 && quote.status === 'quoted') {
          let newStatus = 'pending'; // 默认状态：待处理
          
          // 检查供应商是否已上传过报价文件
          if (quote.supplierFiles && quote.supplierFiles.length > 0) {
            newStatus = 'supplier_quoted'; // 若供应商上传过，退回到"核价中"
          } else {
            // 供应商没有上传过文件，检查是否已分配供应商群组
            if (quote.assignedGroups && quote.assignedGroups.length > 0) {
              newStatus = 'in_progress'; // 若已分配供应商群组，退回到"处理中"
            } else {
              newStatus = 'pending'; // 若没分配过供应商群组，退回到"待处理"
            }
          }
          
          updateData.status = newStatus;
          logger.info(`报价员删除最后一个文件，状态自动回退`, {
            quoteId: req.params.id,
            oldStatus: 'quoted',
            newStatus: newStatus,
            hasSupplierFiles: !!(quote.supplierFiles && quote.supplierFiles.length > 0),
            hasAssignedGroups: !!(quote.assignedGroups && quote.assignedGroups.length > 0),
            assignedGroupsCount: quote.assignedGroups ? quote.assignedGroups.length : 0,
            userId: req.user.userId
          });
        }
      }
    }
    // 处理整个文件数组删除（保留原有逻辑以兼容）
    else if (req.body.deleteCustomerFiles === 'true') {
      // 检查客户文件删除权限
      if (!PermissionUtils.canDeleteFile('customer', quote, req.user)) {
        return res.status(403).json({ message: '您没有权限删除此文件' });
      }
      updateData.$unset = updateData.$unset || {};
      updateData.$unset.customerFiles = 1;
    }
    else if (req.body.deleteSupplierFiles === 'true') {
      // 检查供应商文件删除权限
      if (!PermissionUtils.canDeleteFile('supplier', quote, req.user)) {
        return res.status(403).json({ message: '您没有权限删除此文件' });
      }
      updateData.$unset = updateData.$unset || {};
      updateData.$unset.supplierFiles = 1;
      
      // 如果供应商删除所有文件且当前状态是"供应商已报价"，则回退到"处理中"
      if (quote.status === 'supplier_quoted') {
        updateData.status = 'in_progress';
        logger.info(`供应商删除所有文件，询价单状态从 supplier_quoted 回退到 in_progress`, {
          quoteId: req.params.id,
          userId: req.user.userId
        });
      }
    }
    else if (req.body.deleteQuoterFiles === 'true') {
      // 检查报价员文件删除权限
      if (!PermissionUtils.canDeleteFile('quoter', quote, req.user)) {
        return res.status(403).json({ message: '您没有权限删除此文件' });
      }
      updateData.$unset = updateData.$unset || {};
      updateData.$unset.quoterFiles = 1;
    }
    
    // 根据用户角色处理文件上传
    if (allFiles && allFiles.length > 0) {
      logger.info(`开始处理文件上传`, { 
        quoteId: req.params.id,
        userId: req.user.userId,
        userRole: req.user.role,
        fileCount: allFiles.length,
        frontendFileType: req.body.fileType
      });
      
      const newFiles = allFiles.map(file => {
        const originalNameFixed = fixFileName(file.originalname);
        return {
          filename: file.filename,
          originalName: originalNameFixed,
          path: file.path,
          size: file.size,
          uploadedAt: new Date()
        };
      });
      
      // 优先使用前端传递的文件类型，如果没有则根据用户角色推断
      let targetFileArray;
      let roleSpecificUpdate = {};
      
      if (req.body.fileType) {
        // 前端明确指定了文件类型
        switch (req.body.fileType) {
          case 'customer':
            targetFileArray = 'customerFiles';
            break;
          case 'supplier':
            targetFileArray = 'supplierFiles';
            roleSpecificUpdate.supplier = req.user.userId;
            break;
          case 'quoter':
            targetFileArray = 'quoterFiles';
            roleSpecificUpdate.quoter = req.user.userId;
            break;
          default:
            logger.warn(`前端传递了无效的文件类型: ${req.body.fileType}，将根据用户角色推断`);
            // 根据用户角色推断
            switch (req.user.role) {
              case 'customer':
                targetFileArray = 'customerFiles';
                break;
              case 'supplier':
                targetFileArray = 'supplierFiles';
                roleSpecificUpdate.supplier = req.user.userId;
                break;
              case 'quoter':
              case 'admin':
                targetFileArray = 'quoterFiles';
                roleSpecificUpdate.quoter = req.user.userId;
                break;
              default:
                return res.status(403).json({ message: '无效的用户角色' });
            }
        }
      } else {
        // 前端没有指定文件类型，根据用户角色推断（保持原有逻辑）
        switch (req.user.role) {
          case 'customer':
            targetFileArray = 'customerFiles';
            break;
          case 'supplier':
            targetFileArray = 'supplierFiles';
            roleSpecificUpdate.supplier = req.user.userId;
            break;
          case 'quoter':
          case 'admin':
            targetFileArray = 'quoterFiles';
            roleSpecificUpdate.quoter = req.user.userId;
            break;
          default:
            return res.status(403).json({ message: '无效的用户角色' });
        }
      }
      
      // 处理特殊状态逻辑
      if (targetFileArray === 'supplierFiles' && quote.status === 'rejected') {
        // 如果之前是拒绝状态，清除拒绝理由
        updateData.$unset = updateData.$unset || {};
        updateData.$unset.rejectReason = 1;
        logger.info(`供应商重新上传文件，清除拒绝理由`, { 
          quoteId: req.params.id,
          supplierId: req.user.userId
        });
      }
      
      if (targetFileArray === 'quoterFiles' && quote.rejectReason) {
        // 如果之前有拒绝理由，清除它
        updateData.$unset = updateData.$unset || {};
        updateData.$unset.rejectReason = 1;
        logger.info(`清除拒绝理由，上传最终报价文件`, { 
          quoteId: req.params.id,
          quoterId: req.user.userId
        });
      }
      
      // 如果已有文件，则添加到现有文件列表中
      if (quote[targetFileArray] && quote[targetFileArray].length > 0) {
        updateData.$push = updateData.$push || {};
        updateData.$push[targetFileArray] = { $each: newFiles };
        logger.info(`${req.user.role}文件添加到现有列表`, { 
          quoteId: req.params.id,
          targetField: targetFileArray,
          existingFiles: quote[targetFileArray].length,
          newFiles: newFiles.length
        });
      } else {
        updateData[targetFileArray] = newFiles;
        logger.info(`${req.user.role}文件创建新列表`, { 
          quoteId: req.params.id,
          targetField: targetFileArray,
          newFiles: newFiles.length,
          files: newFiles.map(f => ({ originalName: f.originalName, size: f.size }))
        });
      }
      
      // 添加角色特定的更新数据
      Object.assign(updateData, roleSpecificUpdate);
      
      logger.info(`${req.user.role}文件上传完成`, { 
        quoteId: req.params.id,
        fileCount: newFiles.length,
        targetField: targetFileArray,
        files: newFiles.map(f => ({ originalName: f.originalName, size: f.size }))
      });
    }
    
    const dbStartTime = Date.now();
    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company')
     .populate('supplier', 'name email company')
     .populate('assignedGroups', 'name description color');
    
    logger.database('更新询价单', 'quotes', { quoteId: req.params.id }, Date.now() - dbStartTime);

    // 处理报价员删除文件后的状态回退逻辑
    if (req.body.deleteQuoterFiles === 'true' && updatedQuote.status === 'quoted') {
      let newStatus = 'pending'; // 默认状态：待处理
      
      // 检查供应商是否已上传过报价文件
      if (updatedQuote.supplierFiles && updatedQuote.supplierFiles.length > 0) {
        newStatus = 'supplier_quoted'; // 若供应商上传过，退回到"核价中"
      } else {
        // 供应商没有上传过文件，检查是否已分配供应商群组
        if (updatedQuote.assignedGroups && updatedQuote.assignedGroups.length > 0) {
          newStatus = 'in_progress'; // 若已分配供应商群组，退回到"处理中"
        } else {
          newStatus = 'pending'; // 若没分配过供应商群组，退回到"待处理"
        }
      }
      
      // 更新状态
      if (newStatus !== updatedQuote.status) {
        await Quote.findByIdAndUpdate(req.params.id, { status: newStatus });
        updatedQuote.status = newStatus;
        
        logger.info(`报价员删除最终报价文件，状态自动回退`, {
          quoteId: req.params.id,
          oldStatus: 'quoted',
          newStatus: newStatus,
          hasSupplierFiles: !!(updatedQuote.supplierFiles && updatedQuote.supplierFiles.length > 0),
          hasAssignedGroups: !!(updatedQuote.assignedGroups && updatedQuote.assignedGroups.length > 0),
          assignedGroupsCount: updatedQuote.assignedGroups ? updatedQuote.assignedGroups.length : 0
        });
      }
    }

    // 供应商上传文件时不发送邮件，等待确认报价后才发送
    // 邮件通知移至 confirmSupplierQuote 路由中处理

    // 报价员上传文件时不发送邮件，等待确认最终报价后才发送
    // 邮件通知移至 confirmFinalQuote 路由中处理

    // 使用通用过滤函数处理响应数据
    const filteredQuote = PermissionUtils.filterQuoteData(updatedQuote, req.user.role);
    
    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime);
    logger.info(`${req.user.role}更新询价单完成`, { quoteId: req.params.id, totalTime: `${totalTime}ms` });
    
    res.json(filteredQuote);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    logger.request(req, totalTime, error);
    logger.error('更新询价单失败', { 
      error: error.message,
      stack: error.stack,
      quoteId: req.params.id,
      userId: req.user.userId 
    });
    
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Reject quote (quoter or admin only)
router.patch('/:id/reject', auth, async (req, res) => {
  try {
    const { rejectReason } = req.body;
    
    if (!rejectReason || rejectReason.trim() === '') {
      return res.status(400).json({ message: '请填写不予报价的理由' });
    }
    
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer') {
      return res.status(403).json({ message: '权限不足' });
    }

    // 报价员权限检查：允许未分配的报价员操作，或者已分配的报价员操作自己的询价单
    if (req.user.role === 'quoter' && quote.quoter && quote.quoter._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 根据用户角色设置对应的字段
    const updateData = {
      status: 'rejected',
      rejectReason: rejectReason.trim()
    };
    
    if (req.user.role === 'supplier') {
      updateData.supplier = req.user.userId;
    } else if (req.user.role === 'quoter' || req.user.role === 'admin') {
      updateData.quoter = req.user.userId;
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company')
     .populate('supplier', 'name email company')
     .populate('assignedGroups', 'name description color');

    // 异步发送不予报价通知邮件给客户
    setImmediate(async () => {
      try {
        if (updatedQuote.customer && updatedQuote.customer.email) {
          // 重新获取完整的询价单数据，确保包含客户文件用于附件
          const fullQuote = await Quote.findById(updatedQuote._id)
            .populate('customer', 'name email company')
            .populate('quoter', 'name email company')
            .populate('supplier', 'name email company');
          
          await emailService.sendQuoteRejectionNotification(updatedQuote.customer.email, fullQuote);
          logger.info(`不予报价通知邮件发送完成`, { 
            customerEmail: updatedQuote.customer.email,
            quoteNumber: updatedQuote.quoteNumber,
            rejectReason: updatedQuote.rejectReason,
            hasCustomerFiles: !!(fullQuote.customerFiles && fullQuote.customerFiles.length > 0),
            customerFilesCount: fullQuote.customerFiles ? fullQuote.customerFiles.length : 0
          });
        }
      } catch (error) {
        logger.error('发送不予报价通知邮件失败', { 
          error: error.message,
          quoteId: updatedQuote._id
        });
      }
    });

    // 使用通用过滤函数处理响应数据
    const filteredQuote = PermissionUtils.filterQuoteData(updatedQuote, req.user.role);
    res.json(filteredQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Assign quote to supplier (quoter or admin only)
router.patch('/:id/assign-supplier', auth, async (req, res) => {
  try {
    const { supplierId } = req.body;
    
    // 验证权限：只有报价员和管理员可以分配供应商
    if (!['quoter', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // 验证供应商
    const supplier = await User.findById(supplierId);
    if (!supplier || supplier.role !== 'supplier') {
      return res.status(400).json({ message: '无效的供应商' });
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      { 
        supplier: supplierId,
        status: 'in_progress'
      },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('supplier', 'name email company')
     .populate('assignedGroups', 'name description color');

    // 异步发送邮件通知被选中的供应商
    setImmediate(async () => {
      try {
        // 创建不包含客户信息的询价单对象用于邮件发送
        const sanitizedQuote = {
          _id: updatedQuote._id,
          quoteNumber: updatedQuote.quoteNumber,
          title: updatedQuote.title,
          description: updatedQuote.description,
          createdAt: updatedQuote.createdAt,
          customerFiles: updatedQuote.customerFiles
          // 注意：不包含 customer 字段，保护客户隐私
        };

        await emailService.sendSupplierGroupNotification(supplier.email, sanitizedQuote);
        
        logger.info(`询价单 ${updatedQuote.quoteNumber} 供应商分配邮件发送完成`, { 
          supplierEmail: supplier.email,
          supplierName: supplier.name 
        });
      } catch (error) {
        logger.error('发送供应商分配邮件失败', { 
          error: error.message,
          quoteId: updatedQuote._id,
          supplierId: supplierId 
        });
      }
    });

    res.json(updatedQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Assign quote to groups (quoter or admin only)
router.patch('/:id/assign-groups', auth, async (req, res) => {
  try {
    const { groupIds } = req.body;
    
    // 验证权限：只有报价员和管理员可以分配群组
    if (!['quoter', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 验证群组
    const groups = await Group.find({ 
      _id: { $in: groupIds },
      isActive: true 
    });
    
    if (groups.length !== groupIds.length) {
      return res.status(400).json({ message: '部分群组不存在或已被禁用' });
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // 更新询价单
    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      { 
        assignedGroups: groupIds,
        status: 'in_progress'
      },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company')
     .populate('supplier', 'name email company')
     .populate('assignedGroups', 'name description color');

    // 获取所有属于这些群组的供应商
    const suppliers = await User.find({
      groups: { $in: groupIds },
      role: 'supplier',
      isActive: true
    });

    // 异步发送邮件通知所有相关供应商
    setImmediate(async () => {
      try {
        // 创建不包含客户信息的询价单对象用于邮件发送
        const sanitizedQuote = {
          _id: updatedQuote._id,
          quoteNumber: updatedQuote.quoteNumber,
          title: updatedQuote.title,
          description: updatedQuote.description,
          createdAt: updatedQuote.createdAt,
          customerFiles: updatedQuote.customerFiles
        };

        // 群发邮件给所有供应商
        const emailPromises = suppliers.map(supplier => 
          emailService.sendSupplierGroupNotification(supplier.email, sanitizedQuote)
        );

        await Promise.all(emailPromises);
        
        logger.info(`询价单 ${updatedQuote.quoteNumber} 群组分配邮件发送完成`, { 
          groupIds: groupIds,
          supplierCount: suppliers.length,
          suppliers: suppliers.map(s => s.email)
        });
      } catch (error) {
        logger.error('群组分配邮件发送失败', {
          error: error.message,
          quoteId: updatedQuote._id,
          groupIds: groupIds 
        });
      }
    });

    res.json(updatedQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Remove single group assignment (quoter or admin only)
router.delete('/:id/groups/:groupId', auth, async (req, res) => {
  try {
    // 验证权限：只有报价员和管理员可以移除群组分配
    if (!['quoter', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    const quote = await Quote.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // 从分配的群组中移除指定的群组
    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      { 
        $pull: { assignedGroups: req.params.groupId }
      },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company')
     .populate('supplier', 'name email company')
     .populate('assignedGroups', 'name description color');

    // 如果没有分配任何群组了，将状态改回pending
    if (!updatedQuote.assignedGroups || updatedQuote.assignedGroups.length === 0) {
      updatedQuote.status = 'pending';
      await updatedQuote.save();
    }

    res.json(updatedQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});



// Assign quote to quoter (admin only)
router.patch('/:id/assign', auth, authorize('admin'), async (req, res) => {
  try {
    const { quoterId } = req.body;
    
    const quote = await Quote.findByIdAndUpdate(
      req.params.id,
      { 
        quoter: quoterId,
        status: 'in_progress' 
      },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company');

    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    res.json(quote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Delete quote (customer can delete their own, admin can delete all)
router.delete('/:id', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer' && quote.customer._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    if (req.user.role === 'quoter') {
      return res.status(403).json({ message: '报价员不能删除询价单' });
    }

    // Delete associated files
    const fs = require('fs');
    let deletedFiles = [];
    
    // 删除客户文件数组
    if (quote.customerFiles && quote.customerFiles.length > 0) {
      quote.customerFiles.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          deletedFiles.push(file.originalName);
        }
      });
    }
    
    // 删除供应商文件数组
    if (quote.supplierFiles && quote.supplierFiles.length > 0) {
      quote.supplierFiles.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          deletedFiles.push(file.originalName);
        }
      });
    }
    
    // 删除报价员文件数组
    if (quote.quoterFiles && quote.quoterFiles.length > 0) {
      quote.quoterFiles.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          deletedFiles.push(file.originalName);
        }
      });
    }
    
    // 记录删除的文件
    if (deletedFiles.length > 0) {
      logger.info(`删除询价单相关文件`, { 
        quoteId: req.params.id,
        quoteNumber: quote.quoteNumber,
        deletedFiles: deletedFiles,
        totalFiles: deletedFiles.length
      });
    }

    // Delete the quote
    await Quote.findByIdAndDelete(req.params.id);

    res.json({ message: '询价单删除成功' });
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Download file
router.get('/:id/download/:fileType', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer' && quote.customer._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // 供应商权限检查：只能下载分配给自己的询价单的文件
    if (req.user.role === 'supplier') {
      if (!quote.supplier || quote.supplier._id.toString() !== req.user.userId) {
        return res.status(403).json({ message: '权限不足：您不是当前分配的供应商' });
      }
      
      // 只有在特定状态下才能下载客户文件
      if (req.params.fileType.startsWith('customer') && 
          !['in_progress', 'rejected', 'supplier_quoted', 'quoted'].includes(quote.status)) {
        return res.status(403).json({ message: '权限不足：当前状态下不允许下载客户文件' });
      }
    }

    // 解析文件类型和文件索引
    const [fileType, fileIndex] = req.params.fileType.split('-');
    const index = fileIndex ? parseInt(fileIndex) : null;
    
    let filePath;
    let files;
    
    // 根据文件类型获取对应的文件数组
    switch (fileType) {
      case 'customer':
        files = quote.customerFiles || [];
        break;
      case 'supplier':
        files = quote.supplierFiles || [];
        break;
      case 'quoter':
        files = quote.quoterFiles || [];
        break;
      default:
        return res.status(400).json({ message: '无效的文件类型' });
    }
    
    // 如果指定了索引，下载特定文件；否则下载第一个文件
    const targetFile = index !== null && index >= 0 && index < files.length ? files[index] : files[0];
    
    if (!targetFile) {
      return res.status(404).json({ message: '文件不存在' });
    }
    
    // 权限检查
    if (fileType === 'customer') {
      // 客户可以下载自己的文件，供应商可以下载待处理询价的客户文件或自己已报价的客户文件，报价员和管理员可以下载所有客户文件
      if (req.user.role === 'customer') {
        filePath = targetFile.path;
      } else if (req.user.role === 'supplier') {
        // 供应商权限检查：
        // 1. 直接分配给自己的询价单
        // 2. 分配给自己所在群组的询价单
        const supplier = await User.findById(req.user.userId).select('groups');
        const supplierGroupIds = supplier ? supplier.groups : [];
        
        const canAccess = (quote.supplier && quote.supplier._id?.toString() === req.user.userId) ||
                        (quote.assignedGroups && quote.assignedGroups.some(group => 
                          supplierGroupIds.includes(group._id.toString())
                        ));
        
        if (!canAccess) {
          return res.status(403).json({ message: '权限不足：您无权访问此询价单的文件' });
        }
        filePath = targetFile.path;
      } else if (req.user.role === 'quoter' || req.user.role === 'admin') {
        // 报价员和管理员可以下载所有客户文件以便处理询价单
        filePath = targetFile.path;
      } else {
        return res.status(403).json({ message: '权限不足' });
      }
    } else if (fileType === 'quoter') {
      // 只有报价员和管理员可以下载最终报价文件，客户只能在完成后下载
      if (req.user.role === 'quoter' || req.user.role === 'admin' || 
          (req.user.role === 'customer' && quote.status === 'quoted')) {
        filePath = targetFile.path;
      } else {
        return res.status(403).json({ message: '权限不足' });
      }
    } else if (fileType === 'supplier') {
      // 供应商文件权限检查：
      // 1. 自己上传的文件
      // 2. 同一群组的供应商可以互相查看报价文件
      if (req.user.role === 'supplier') {
        const supplier = await User.findById(req.user.userId).select('groups');
        const supplierGroupIds = supplier ? supplier.groups : [];
        
        const canAccess = (quote.supplier && quote.supplier._id?.toString() === req.user.userId) ||
                        (quote.assignedGroups && quote.assignedGroups.some(group => 
                          supplierGroupIds.includes(group._id.toString())
                        ));
        
        if (canAccess) {
          filePath = targetFile.path;
        } else {
          return res.status(403).json({ message: '权限不足：您无权访问此供应商文件' });
        }
      } else if (req.user.role === 'quoter' || req.user.role === 'admin') {
        filePath = targetFile.path;
      } else {
        return res.status(403).json({ message: '权限不足' });
      }
    }

    // 使用正确的文件名编码，避免Windows下的编码问题
    const safeFileName = `${quote.quoteNumber}_${fileType}_${Date.now()}${path.extname(targetFile.originalName)}`;
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(safeFileName)}`);
    
    return fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Batch download files as ZIP
router.get('/:id/download/:fileType/batch', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // 权限检查（与单个文件下载相同）
    if (req.user.role === 'customer' && quote.customer._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    let files;
    let zipFileName;
    
    // 根据文件类型获取对应的文件数组
    switch (req.params.fileType) {
      case 'customer':
        files = quote.customerFiles || [];
        zipFileName = `${quote.quoteNumber}_customer_files.zip`;
        
        // 客户可以下载自己的文件，供应商可以下载分配给自己或群组的询价单
        if (req.user.role !== 'customer') {
          if (req.user.role === 'supplier') {
            const supplier = await User.findById(req.user.userId).select('groups');
            const supplierGroupIds = supplier ? supplier.groups : [];
            
            const canAccess = (quote.supplier && quote.supplier._id?.toString() === req.user.userId) ||
                            (quote.assignedGroups && quote.assignedGroups.some(group => 
                              supplierGroupIds.includes(group._id.toString())
                            ));
            
            if (!canAccess) {
              return res.status(403).json({ message: '权限不足：您无权访问此询价单的文件' });
            }
          } else if (req.user.role !== 'quoter' && req.user.role !== 'admin') {
            return res.status(403).json({ message: '权限不足' });
          }
        }
        break;
      case 'supplier':
        files = quote.supplierFiles || [];
        zipFileName = `${quote.quoteNumber}_supplier_files.zip`;
        
        // 供应商可以下载自己或同群组供应商上传的文件，报价员和管理员可以下载所有供应商文件
        if (req.user.role === 'supplier') {
          const supplier = await User.findById(req.user.userId).select('groups');
          const supplierGroupIds = supplier ? supplier.groups : [];
          
          const canAccess = (quote.supplier && quote.supplier._id?.toString() === req.user.userId) ||
                          (quote.assignedGroups && quote.assignedGroups.some(group => 
                            supplierGroupIds.includes(group._id.toString())
                          ));
          
          if (!canAccess) {
            return res.status(403).json({ message: '权限不足：您无权访问此供应商文件' });
          }
        } else if (req.user.role !== 'quoter' && req.user.role !== 'admin') {
          return res.status(403).json({ message: '权限不足' });
        }
        break;
      case 'quoter':
        files = quote.quoterFiles || [];
        zipFileName = `${quote.quoteNumber}_quoter_files.zip`;
        
        // 只有报价员和管理员可以下载最终报价文件，客户只能在完成后下载
        if (req.user.role !== 'quoter' && req.user.role !== 'admin' && 
            !(req.user.role === 'customer' && quote.status === 'quoted')) {
          return res.status(403).json({ message: '权限不足' });
        }
        break;
      default:
        return res.status(400).json({ message: '无效的文件类型' });
    }
    
    if (files.length === 0) {
      return res.status(404).json({ message: '没有可下载的文件' });
    }
    
    // 始终创建ZIP文件，即使只有一个文件，以确保一致性
    // 创建ZIP文件
    res.setHeader('Content-Type', 'application/zip');
    // 使用RFC 2231编码格式确保跨平台兼容性
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"; filename*=UTF-8''${encodeURIComponent(zipFileName)}`);
    
    const archive = archiver('zip', {
      zlib: { level: 9 } // 最高压缩级别
    });
    
    archive.pipe(res);
    
    // 添加文件到ZIP
    for (const file of files) {
      if (fs.existsSync(file.path)) {
        archive.file(file.path, { name: file.originalName });
      }
    }
    
    archive.finalize();
    
    logger.info(`批量下载文件`, { 
      quoteId: req.params.id,
      fileType: req.params.fileType,
      fileCount: files.length,
      userId: req.user.userId
    });
    
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Confirm supplier quote (supplier only)
router.patch('/:id/confirm-supplier-quote', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions: only assigned supplier can confirm
    if (req.user.role !== 'supplier' || 
        !quote.supplier || 
        quote.supplier._id?.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    // Check if supplier file exists
    if (!quote.supplierFiles || quote.supplierFiles.length === 0) {
      return res.status(400).json({ message: '请先上传报价文件' });
    }

    // Check if already confirmed
    if (quote.status === 'supplier_quoted') {
      return res.status(400).json({ message: '报价已经确认' });
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      { status: 'supplier_quoted' },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company')
     .populate('supplier', 'name email company')
     .populate('assignedGroups', 'name description color');

    // 异步发送邮件通知报价员
    setImmediate(async () => {
      try {
        logger.info(`开始发送供应商确认报价邮件`, { 
          quoteId: updatedQuote._id,
          quoteNumber: updatedQuote.quoteNumber,
          hasQuoter: !!updatedQuote.quoter,
          quoterEmail: updatedQuote.quoter?.email,
          hasSupplier: !!updatedQuote.supplier,
          supplierName: updatedQuote.supplier?.name
        });
        
        if (updatedQuote.quoter && updatedQuote.quoter.email) {
          // 如果有分配的报价员，只发送给该报价员
          await emailService.sendSupplierQuotedNotification(updatedQuote.quoter.email, updatedQuote);
          logger.info(`供应商确认报价邮件发送完成`, { 
            quoterEmail: updatedQuote.quoter.email,
            quoteNumber: updatedQuote.quoteNumber
          });
        } else {
          // 如果没有分配报价员，发送给所有活跃的报价员
          logger.info(`询价单未分配报价员，发送给所有活跃报价员`, { 
            quoteNumber: updatedQuote.quoteNumber
          });
          
          const quoters = await User.find({ role: 'quoter', isActive: true })
            .select('email')
            .lean();
          
          if (quoters.length > 0) {
            logger.info(`找到 ${quoters.length} 个活跃报价员，开始发送邮件`);
            
            const emailPromises = quoters.map(quoter => 
              emailService.sendSupplierQuotedNotification(quoter.email, updatedQuote)
                .catch(error => logger.error(`发送供应商确认报价邮件给 ${quoter.email} 失败`, { error: error.message }))
            );
            
            await Promise.allSettled(emailPromises);
            logger.info(`供应商确认报价邮件发送完成（发送给所有报价员）`, { 
              quoteNumber: updatedQuote.quoteNumber,
              totalQuoters: quoters.length 
            });
          } else {
            logger.warn('没有找到活跃的报价员，无法发送邮件通知');
          }
        }
      } catch (error) {
        logger.error('发送供应商确认报价邮件失败', { 
          error: error.message,
          quoteId: updatedQuote._id,
          stack: error.stack
        });
      }
    });



    // 使用通用过滤函数处理响应数据
    const filteredQuote = PermissionUtils.filterQuoteData(updatedQuote, req.user.role);
    res.json(filteredQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Confirm final quote (quoter or admin only)
router.patch('/:id/confirm-final-quote', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions: only quoter or admin can confirm
    if (!['quoter', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: '权限不足' });
    }

    // Check if quoter file exists
    if (!quote.quoterFiles || quote.quoterFiles.length === 0) {
      return res.status(400).json({ message: '请先上传最终报价文件' });
    }

    // Check if already confirmed
    if (quote.status === 'quoted') {
      return res.status(400).json({ message: '最终报价已经确认' });
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      { status: 'quoted' },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company')
     .populate('supplier', 'name email company')
     .populate('assignedGroups', 'name description color');

    // 异步发送邮件通知客户
    setImmediate(async () => {
      try {
        if (updatedQuote.customer && updatedQuote.customer.email) {
          // 重新获取完整的询价单数据，确保包含 quoterFiles
          const fullQuote = await Quote.findById(updatedQuote._id)
            .populate('customer', 'name email company')
            .populate('quoter', 'name email company')
            .populate('supplier', 'name email company');
          
          await emailService.sendFinalQuoteNotification(updatedQuote.customer.email, fullQuote);
          logger.info(`最终报价确认邮件发送完成`, { 
            customerEmail: updatedQuote.customer.email,
            quoteNumber: updatedQuote.quoteNumber,
            hasQuoterFiles: !!(fullQuote.quoterFiles && fullQuote.quoterFiles.length > 0),
            quoterFilesCount: fullQuote.quoterFiles ? fullQuote.quoterFiles.length : 0
          });
        }
      } catch (error) {
        logger.error('发送最终报价确认邮件失败', { 
          error: error.message,
          quoteId: updatedQuote._id
        });
      }
    });



    // 使用通用过滤函数处理响应数据
    const filteredQuote = PermissionUtils.filterQuoteData(updatedQuote, req.user.role);
    res.json(filteredQuote);
  } catch (error) {
    logger.request(req, Date.now() - (req.startTime || Date.now()), error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});


module.exports = router;