require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const resumeRoutes = require('./routes/resume');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/admin', adminRoutes);

// 管理后台静态文件
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// 公开下载文件
app.use('/download', express.static(path.join(__dirname, 'public')));

// 管理后台默认跳转到登录页
app.get('/admin', (req, res) => {
  res.redirect('/admin/login.html');
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ code: 404, message: '接口不存在' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      code: 400,
      message: `文件大小不能超过 ${process.env.MAX_FILE_SIZE || 10}MB`,
    });
  }
  console.error('服务器错误:', err);
  res.status(500).json({ code: 500, message: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`\n  PDF Upload Service 已启动`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  服务地址:  http://localhost:${PORT}`);
  console.log(`  管理后台:  http://localhost:${PORT}/admin`);
  console.log(`  API健康检查: http://localhost:${PORT}/api/health`);
  console.log(`\n  请先配置 .env 中的腾讯云 COS 密钥\n`);
});
