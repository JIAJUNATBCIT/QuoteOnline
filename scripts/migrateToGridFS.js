const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { GridFSBucket } = require('mongodb');
require('dotenv').config();

// 导入所有相关模型
const Quote = require('../models/Quote');
const QuoteWithGridFS = require('../models/QuoteWithGridFS');
const User = require('../models/User');
const SupplierGroup = require('../models/SupplierGroup');
const CustomerGroup = require('../models/CustomerGroup');

class DataMigrator {
  constructor() {
    this.bucket = null;
  }

  async connect() {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    this.bucket = new GridFSBucket(mongoose.connection.db);
    console.log('MongoDB连接成功');
  }

  /**
   * 将单个文件上传到GridFS
   */
  async uploadFileToGridFS(filePath, originalName) {
    return new Promise((resolve, reject) => {
      const uploadStream = this.bucket.openUploadStream(originalName, {
        metadata: {
          originalName: originalName,
          uploadDate: new Date(),
          migrated: true
        }
      });

      fs.createReadStream(filePath)
        .pipe(uploadStream)
        .on('error', reject)
        .on('finish', () => {
          resolve({
            fileId: uploadStream.id.toString(),
            filename: uploadStream.id.toString(),
            originalName: originalName,
            path: uploadStream.id.toString(),
            size: uploadStream.length,
            uploadedAt: new Date()
          });
        });
    });
  }

  /**
   * 迁移单个询价单的文件
   */
  async migrateQuoteFiles(quote) {
    console.log(`迁移询价单 ${quote.quoteNumber} 的文件...`);
    
    const migratedFiles = {
      customerFiles: [],
      supplierFiles: [],
      quoterFiles: []
    };

    // 迁移客户文件
    if (quote.customerFiles && quote.customerFiles.length > 0) {
      for (const file of quote.customerFiles) {
        if (file.path && fs.existsSync(file.path)) {
          try {
            const migratedFile = await this.uploadFileToGridFS(file.path, file.originalName);
            migratedFiles.customerFiles.push(migratedFile);
            console.log(`✓ 客户文件迁移成功: ${file.originalName}`);
          } catch (error) {
            console.error(`✗ 客户文件迁移失败: ${file.originalName}`, error.message);
          }
        }
      }
    }

    // 迁移供应商文件
    if (quote.supplierFiles && quote.supplierFiles.length > 0) {
      for (const file of quote.supplierFiles) {
        if (file.path && fs.existsSync(file.path)) {
          try {
            const migratedFile = await this.uploadFileToGridFS(file.path, file.originalName);
            migratedFiles.supplierFiles.push(migratedFile);
            console.log(`✓ 供应商文件迁移成功: ${file.originalName}`);
          } catch (error) {
            console.error(`✗ 供应商文件迁移失败: ${file.originalName}`, error.message);
          }
        }
      }
    }

    // 迁移报价员文件
    if (quote.quoterFiles && quote.quoterFiles.length > 0) {
      for (const file of quote.quoterFiles) {
        if (file.path && fs.existsSync(file.path)) {
          try {
            const migratedFile = await this.uploadFileToGridFS(file.path, file.originalName);
            migratedFiles.quoterFiles.push(migratedFile);
            console.log(`✓ 报价员文件迁移成功: ${file.originalName}`);
          } catch (error) {
            console.error(`✗ 报价员文件迁移失败: ${file.originalName}`, error.message);
          }
        }
      }
    }

    return migratedFiles;
  }

  /**
   * 批量迁移所有询价单
   */
  async migrateAllQuotes() {
    console.log('开始迁移所有询价单数据...');
    
    const quotes = await Quote.find({}).populate('customer quoter supplier assignedGroups customerGroups');
    
    console.log(`找到 ${quotes.length} 个询价单需要迁移`);
    
    let successCount = 0;
    let errorCount = 0;

    for (const quote of quotes) {
      try {
        // 迁移文件
        const migratedFiles = await this.migrateQuoteFiles(quote);
        
        // 创建新的GridFS询价单
        const newQuoteData = {
          ...quote.toObject(),
          _id: quote._id, // 保持相同的ID
          customerFiles: migratedFiles.customerFiles,
          supplierFiles: migratedFiles.supplierFiles,
          quoterFiles: migratedFiles.quoterFiles
        };

        // 删除_id字段，让MongoDB自动生成
        delete newQuoteData._id;
        
        const newQuote = new QuoteWithGridFS(newQuoteData);
        await newQuote.save();
        
        successCount++;
        console.log(`✓ 询价单迁移成功: ${quote.quoteNumber}`);
        
      } catch (error) {
        errorCount++;
        console.error(`✗ 询价单迁移失败: ${quote.quoteNumber}`, error.message);
      }
    }

    console.log(`\n迁移完成:`);
    console.log(`✓ 成功: ${successCount}`);
    console.log(`✗ 失败: ${errorCount}`);
    console.log(`总计: ${quotes.length}`);
  }

  async disconnect() {
    await mongoose.disconnect();
    console.log('数据库连接已关闭');
  }
}

// 执行迁移
async function runMigration() {
  const migrator = new DataMigrator();
  
  try {
    await migrator.connect();
    await migrator.migrateAllQuotes();
  } catch (error) {
    console.error('迁移过程中发生错误:', error);
  } finally {
    await migrator.disconnect();
  }
}

// 如果是直接运行此脚本
if (require.main === module) {
  runMigration().then(() => {
    console.log('迁移脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error('迁移脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = DataMigrator;