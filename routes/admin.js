const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const bcrypt = require('bcryptjs');
const { getAllUsers, getUserById, updateUserRole, resetUserPassword, getAllFiles } = require('../db/database');

const router = express.Router();

// GET /api/admin/check — 返回当前用户角色信息（仅需登录）
router.get('/check', authMiddleware, (req, res) => {
  res.json({
    code: 200,
    data: { role: req.user.role || 'user' }
  });
});

// 以下路由需要 admin 权限
router.use(adminMiddleware);

// GET /api/admin/users — 获取所有用户列表（不含密码）
router.get('/users', (req, res) => {
  try {
    const users = getAllUsers();
    res.json({
      code: 200,
      data: { users }
    });
  } catch (err) {
    console.error('获取用户列表失败:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// GET /api/admin/resumes — 管理员查看全公司简历文件列表（受 admin 中间件保护，非管理员不可访问）
router.get('/resumes', (req, res) => {
  try {
    const files = getAllFiles();
    const list = files.map((f) => ({
      fileId: f.id,
      fileName: f.file_name,
      fileSize: f.file_size,
      fileSizeReadable: f.file_size_readable,
      uploadTime: f.upload_time,
      uploader: f.username,
    }));
    res.json({
      code: 200,
      data: { total: list.length, files: list },
    });
  } catch (err) {
    console.error('获取全量简历失败:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// PUT /api/admin/users/:id/role — 修改用户角色
router.put('/users/:id/role', (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ code: 400, message: '角色必须为 admin 或 user' });
    }

    // 不允许修改自己的角色
    if (id === req.user.id) {
      return res.status(400).json({ code: 400, message: '不能修改自己的角色' });
    }

    const user = getUserById(id);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    const updated = updateUserRole(id, role);
    if (!updated) {
      return res.status(500).json({ code: 500, message: '更新失败' });
    }

    res.json({
      code: 200,
      message: '角色更新成功',
      data: { id, username: user.username, role }
    });
  } catch (err) {
    console.error('修改角色失败:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// PUT /api/admin/users/:id/password — 重置用户密码（仅 admin）
router.put('/users/:id/password', (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body || {};

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ code: 400, message: '新密码至少 6 位' });
    }

    const user = getUserById(id);
    if (!user) {
      return res.status(404).json({ code: 404, message: '用户不存在' });
    }

    const hash = bcrypt.hashSync(newPassword, 10);
    const ok = resetUserPassword(id, hash);
    if (!ok) {
      return res.status(500).json({ code: 500, message: '重置失败' });
    }

    res.json({
      code: 200,
      message: '密码已重置，请通知该用户使用新密码重新登录',
      data: { id, username: user.username }
    });
  } catch (err) {
    console.error('重置密码失败:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

module.exports = router;
