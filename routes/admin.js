const express = require('express');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const { getAllUsers, getUserById, updateUserRole } = require('../db/database');

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

module.exports = router;
