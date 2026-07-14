const express = require('express');
const authMiddleware = require('../middleware/auth');
const { parseResume } = require('../services/resume-parser');
const { downloadFromCos } = require('../services/cos');
const {
  getResumeParsedByFileId,
  getResumeParsed,
  upsertResumeParsed,
  updateResumeParsedField,
  getFileById,
} = require('../db/database');

const router = express.Router();

router.use(authMiddleware);

// POST /api/resume/parse/:fileId - 手动触发解析
router.post('/parse/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const file = getFileById(fileId);

    if (!file) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }
    if (file.user_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '无权操作此文件' });
    }

    // 从 COS 下载 PDF
    const pdfBuffer = await downloadFromCos(file.cos_key);

    // 解析简历
    const parsed = await parseResume(pdfBuffer);

    // 归一化手机号：去掉横线、空格、括号
    if (parsed.phone) {
      parsed.phone = parsed.phone.replace(/[\s\-\(\)（）]/g, '');
    }

    // 保存解析结果
    upsertResumeParsed(fileId, parsed);

    res.json({
      code: 200,
      message: '解析成功',
      data: getResumeParsedByFileId(fileId),
    });
  } catch (err) {
    console.error('简历解析失败:', err);
    res.status(500).json({ code: 500, message: '解析失败: ' + err.message });
  }
});

// GET /api/resume - 获取所有解析结果
router.get('/', (req, res) => {
  try {
    const list = getResumeParsed();
    res.json({
      code: 200,
      data: { total: list.length, list },
    });
  } catch (err) {
    console.error('获取解析结果失败:', err);
    res.status(500).json({ code: 500, message: '获取失败' });
  }
});

// GET /api/resume/:fileId - 获取单个文件的解析结果
router.get('/:fileId', (req, res) => {
  try {
    const file = getFileById(req.params.fileId);
    if (!file) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }
    if (file.user_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '无权查看' });
    }

    const parsed = getResumeParsedByFileId(req.params.fileId);
    if (!parsed) {
      return res.json({ code: 200, data: null, message: '该文件尚未解析' });
    }

    res.json({ code: 200, data: parsed });
  } catch (err) {
    console.error('获取解析结果失败:', err);
    res.status(500).json({ code: 500, message: '获取失败' });
  }
});

// PUT /api/resume/:fileId - 更新单个字段
router.put('/:fileId', (req, res) => {
  try {
    const fileId = req.params.fileId;
    const { field, value } = req.body;

    const file = getFileById(fileId);
    if (!file) {
      return res.status(404).json({ code: 404, message: '文件不存在' });
    }
    if (file.user_id !== req.user.id) {
      return res.status(403).json({ code: 403, message: '无权操作此文件' });
    }
    if (!field || value === undefined) {
      return res.status(400).json({ code: 400, message: '缺少 field 或 value' });
    }

    const result = updateResumeParsedField(fileId, field, value);

    res.json({
      code: 200,
      message: '更新成功',
      data: result,
    });
  } catch (err) {
    console.error('更新解析字段失败:', err);
    res.status(500).json({ code: 500, message: '更新失败: ' + err.message });
  }
});

module.exports = router;
