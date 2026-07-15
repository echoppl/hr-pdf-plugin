const authMiddleware = require('./auth');

function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ code: 403, message: '权限不足，仅管理员可操作' });
  }
  next();
}

module.exports = [authMiddleware, adminMiddleware];
