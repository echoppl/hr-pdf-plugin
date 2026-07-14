const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createUser, findUserByUsername } = require('../db/database');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ code: 400, message: '用户名长度需要3-20个字符' });
    }

    if (password.length < 6) {
      return res.status(400).json({ code: 400, message: '密码长度不能少于6位' });
    }

    // 检查用户名是否已存在
    const existing = findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ code: 409, message: '用户名已被注册' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = createUser(username, hashedPassword);

    // 注册成功直接返回 token
    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      code: 200,
      message: '注册成功',
      data: { token, username: user.username }
    });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    }

    const user = findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      code: 200,
      message: '登录成功',
      data: { token, username: user.username }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

module.exports = router;
