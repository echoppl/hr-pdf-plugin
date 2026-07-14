const express = require('express');
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { uploadToCos, downloadFromCos, deleteFromCos } = require('../services/cos');
const { createFileRecord, getFilesByUserId, getFileById, deleteFile, upsertResumeParsed } = require('../db/database');
const { parseResume } = require('../services/resume-parser');

const router = express.Router();

// 配置 multer：内存存储，限制文件大小和类型
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE) || 10) * 1024 * 1024, // 默认 10MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许 PDF
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('仅支持 PDF 文件格式'), false);
    }
    cb(null, true);
  },
});

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// 所有文件接口都需要登录
router.use(authMiddleware);

// POST /api/files/upload - 上传文件
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, message: '请选择要上传的文件' });
    }

    const { originalname, buffer, size } = req.file;
    const userId = req.user.id;

    // 上传到 COS
    const { fileUrl, cosKey } = await uploadToCos(userId, buffer, originalname);

    // 记录到数据库
    const record = createFileRecord(
      userId,
      originalname,
      fileUrl,
      size,
      formatFileSize(size),
      cosKey
    );

    res.json({
      code: 200,
      message: '上传成功',
      data: {
        fileId: record.id,
        fileUrl: record.file_url,
        fileName: record.file_name,
        fileSize: record.file_size,
        fileSizeReadable: record.file_size_readable,
        uploadTime: record.upload_time,
      },
    });

    // 异步触发简历解析（不阻塞上传响应）
    if (buffer && buffer.length > 0) {
      parseResume(buffer)
        .then((parsed) => {
          // 归一化手机号：去掉横线、空格、括号
          if (parsed.phone) {
            parsed.phone = parsed.phone.replace(/[\s\-\(\)（）]/g, '');
          }
          upsertResumeParsed(record.id, parsed);
          console.log(`简历解析完成: ${record.id}`);
        })
        .catch((err) => {
          console.log(`简历解析失败 (${record.id}): ${err.message}`);
        });
    }
  } catch (err) {
    if (err.message === '仅支持 PDF 文件格式') {
      return res.status(400).json({ code: 400, message: err.message });
    }
    console.error('上传失败:', err);
    res.status(500).json({ code: 500, message: '上传失败: ' + err.message });
  }
});

// GET /api/files/list - 文件列表
router.get('/list', (req, res) => {
  try {
    const files = getFilesByUserId(req.user.id);

    const list = files.map((f) => ({
      fileId: f.id,
      fileUrl: f.file_url,
      fileName: f.file_name,
      fileSize: f.file_size,
      fileSizeReadable: f.file_size_readable,
      uploadTime: f.upload_time,
      // 解析字段
      parsed: f.parsed_at ? {
        name: f.name || '',
        gender: f.gender || '',
        age: f.age || '',
        education: f.education || '',
        city: f.city || '',
        years_total: f.years_total || '',
        target_position: f.target_position || '',
        phone: f.phone || '',
        email: f.email || '',
        work_experiences: f.work_experiences || [],
        source_channel: f.source_channel || '',
        hr_name: f.hr_name || '',
        reviewer: f.reviewer || '',
        parsed_at: f.parsed_at,
      } : null,
    }));

    res.json({
      code: 200,
      data: { total: list.length, files: list },
    });
  } catch (err) {
    console.error('获取文件列表失败:', err);
    res.status(500).json({ code: 500, message: '获取文件列表失败' });
  }
});

// GET /api/files/:id/download - 下载文件
router.get('/:id/download', async (req, res) => {
  try {
    const file = getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }
    if (file.user_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '无权访问此文件' });
    }

    const fileBuffer = await downloadFromCos(file.cos_key);

    // 如果是 preview 模式（新窗口打开），inline 显示；否则下载
    const isPreview = req.query.preview === '1';
    const disposition = isPreview
      ? 'inline'
      : `attachment; filename="${encodeURIComponent(file.file_name)}"`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', disposition);
    res.send(fileBuffer);
  } catch (err) {
    console.error('下载失败:', err);
    res.status(500).json({ code: 500, message: '下载失败' });
  }
});

// DELETE /api/files/:id - 删除文件
router.delete('/:id', async (req, res) => {
  try {
    const file = getFileById(req.params.id);
    if (!file) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }
    if (file.user_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '无权删除此文件' });
    }

    // 删除 COS 文件
    await deleteFromCos(file.cos_key);

    // 删除数据库记录
    deleteFile(file.id, req.user.id);

    res.json({ code: 200, message: '删除成功' });
  } catch (err) {
    console.error('删除失败:', err);
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

module.exports = router;
