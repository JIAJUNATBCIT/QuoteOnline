const { GridFSBucket } = require('mongodb');
const mongoose = require('mongoose');

class GridFSStorage {
  constructor() {
    this.bucket = new GridFSBucket(mongoose.connection.db);
  }

  /**
   * 处理文件上传 - 符合multer存储引擎接口
   */
  _handleFile(req, file, cb) {
    // 修复文件名编码问题
    const fixedFileName = this.fixFileName(file.originalname);
    
    const metadata = {
      originalName: fixedFileName,
      uploadDate: new Date(),
      contentType: file.mimetype,
      size: 0
    };

    const uploadStream = this.bucket.openUploadStream(fixedFileName, {
      metadata: metadata
    });

    let fileSize = 0;
    
    file.stream.on('data', (chunk) => {
      fileSize += chunk.length;
    });

    file.stream.pipe(uploadStream)
      .on('error', (error) => {
        cb(error);
      })
      .on('finish', () => {
        cb(null, {
          filename: uploadStream.id.toString(),
          originalName: file.originalname,
          path: uploadStream.id.toString(), // 使用GridFS文件ID作为路径
          size: fileSize,
          uploadedAt: new Date(),
          fileId: uploadStream.id // 保存文件ID用于后续操作
        });
      });
  }

  /**
   * 删除文件 - 符合multer存储引擎接口
   */
  async _removeFile(req, file, cb) {
    // 支持多种文件ID字段名：gridfsId, fileId, path, _id
    const fileId = file.gridfsId || file.fileId || file.path || file._id;
    
    if (fileId) {
      try {
        // 确保fileId是ObjectId格式
        let objectId;
        const mongoose = require('mongoose');
        // 如果fileId已经是ObjectId，直接使用；否则转换
        if (fileId && typeof fileId === 'object' && fileId.constructor.name === 'ObjectId') {
          objectId = fileId;
        } else if (typeof fileId === 'string' && mongoose.Types.ObjectId.isValid(fileId)) {
          objectId = new mongoose.Types.ObjectId(fileId);
        } else {
          throw new Error(`无效的ObjectId格式: ${fileId} (类型: ${typeof fileId})`);
        }
        
        // 使用现代API删除GridFS文件
        const db = mongoose.connection.db;
        
        // 先检查文件是否存在
        const fileRecord = await db.collection('fs.files').findOne({ _id: objectId });
        
        if (!fileRecord) {
          cb(null);
          return;
        }
        
        // 删除chunks
        await db.collection('fs.chunks').deleteMany({ files_id: objectId });
        
        // 删除files记录
        await db.collection('fs.files').deleteOne({ _id: objectId });
        
        cb(null);
        
      } catch (error) {
        cb(error);
      }
    } else {
      cb(new Error('文件ID不存在'));
    }
  }

  /**
   * 从GridFS读取文件流
   */
  async getFileStream(fileId) {
    try {
      const objectId = new mongoose.Types.ObjectId(fileId);
      return this.bucket.openDownloadStream(objectId);
    } catch (error) {
      throw new Error(`获取文件流失败: ${error.message}`);
    }
  }

  /**
   * 获取文件信息
   */
  async getFileInfo(fileId) {
    try {
      const objectId = new mongoose.Types.ObjectId(fileId);
      const files = await this.bucket.find({ _id: objectId }).toArray();
      return files[0] || null;
    } catch (error) {
      throw new Error(`获取文件信息失败: ${error.message}`);
    }
  }

  /**
   * 修复文件名编码问题
   */
  fixFileName(name) {
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
}

module.exports = GridFSStorage;