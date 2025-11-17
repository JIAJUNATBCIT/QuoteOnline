const express = require('express');
const multer = require('multer');
const path = require('path');
const Quote = require('../models/Quote');
const User = require('../models/User');
const { auth, authorize } = require('../middleware/auth');
const emailService = require('../services/emailService');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // 直接使用原始文件名，新文件覆盖旧文件
    cb(null, file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('只支持Excel文件'), false);
    }
  }
});

// Create quote (customer only)
router.post('/', auth, authorize('customer'), upload.single('customerFile'), async (req, res) => {
  try {
    const { title, description, customerMessage } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: '请上传Excel文件' });
    }

    const quote = new Quote({
      customer: req.user.userId,
      title,
      description,
      customerMessage,
      customerFile: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size
      }
    });

    await quote.save();
    await quote.populate('customer', 'name email company');

    // Send email to all quoters
    const quoters = await User.find({ role: 'quoter', isActive: true });
    for (const quoter of quoters) {
      await emailService.sendQuoteNotification(quoter.email, quote);
    }

    res.status(201).json(quote);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Get all quotes
router.get('/', auth, async (req, res) => {
  try {
    let quotes;
    
    if (req.user.role === 'customer') {
      // Customers can only see their own quotes
      quotes = await Quote.find({ customer: req.user.userId })
        .populate('customer', 'name email company')
        .populate('quoter', 'name email company')
        .sort({ createdAt: -1 });
    } else {
      // Quoters and admins can see all quotes
      quotes = await Quote.find()
        .populate('customer', 'name email company')
        .populate('quoter', 'name email company')
        .sort({ createdAt: -1 });
    }

    res.json(quotes);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Get quote by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id)
      .populate('customer', 'name email company')
      .populate('quoter', 'name email company');

    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Customers can only see their own quotes
    if (req.user.role === 'customer' && quote.customer._id.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    res.json(quote);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// Update quote (customer can update their own, quoter can update assigned)
router.put('/:id', auth, upload.single('quoterFile'), async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id);
    
    if (!quote) {
      return res.status(404).json({ message: '询价单不存在' });
    }

    // Check permissions
    if (req.user.role === 'customer' && quote.customer.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    if (req.user.role === 'quoter' && quote.quoter && quote.quoter.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    const updateData = { ...req.body };
    
    if (req.file && (req.user.role === 'quoter' || req.user.role === 'admin')) {
      updateData.quoterFile = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        size: req.file.size
      };
      updateData.status = 'completed';
      updateData.quoter = req.user.userId;
    }
    
    // 处理删除报价文件的情况
    if (req.body.quoterFile === '' && (req.user.role === 'quoter' || req.user.role === 'admin')) {
      // 删除物理文件
      if (quote.quoterFile && quote.quoterFile.path) {
        const fs = require('fs');
        if (fs.existsSync(quote.quoterFile.path)) {
          fs.unlinkSync(quote.quoterFile.path);
        }
      }
      // 直接更新字段，确保前端能正确识别
      updateData.quoterFile = null;
      updateData.status = 'pending';
      updateData.quoter = undefined;
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company');

    res.json(updatedQuote);
  } catch (error) {
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

    if (req.user.role === 'quoter' && quote.quoter && quote.quoter.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    const updatedQuote = await Quote.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'rejected',
        rejectReason: rejectReason.trim(),
        quoter: req.user.userId
      },
      { new: true }
    ).populate('customer', 'name email company')
     .populate('quoter', 'name email company');

    res.json(updatedQuote);
  } catch (error) {
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
    if (req.user.role === 'customer' && quote.customer.toString() !== req.user.userId) {
      return res.status(403).json({ message: '权限不足' });
    }

    let filePath;
    if (req.params.fileType === 'customer' && quote.customerFile) {
      filePath = quote.customerFile.path;
    } else if (req.params.fileType === 'quoter' && quote.quoterFile) {
      filePath = quote.quoterFile.path;
    } else {
      return res.status(404).json({ message: '文件不存在' });
    }

    res.download(filePath);
  } catch (error) {
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;