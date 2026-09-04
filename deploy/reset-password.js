#!/usr/bin/env node
/**
 * 密码重置 / 账号列举（运维工具，不对外暴露）
 *
 * 用法（在容器内执行）：
 *   列出所有账号        node deploy/reset-password.js
 *   重置指定账号密码     node deploy/reset-password.js <username> <newPassword>
 *
 * 说明：
 *   - 账号密码为 bcrypt 哈希，无法还原明文，只能重置
 *   - DB_PATH 默认 ../data/data.db（容器内即 /app/data/data.db）
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'data.db');
const db = new Database(DB_PATH);

function listUsers() {
  const rows = db.prepare('SELECT username, role, created_at FROM users ORDER BY created_at').all();
  console.log('已注册账号:');
  console.table(rows);
}

const [, , username, newPassword] = process.argv;

if (!username) {
  listUsers();
  console.log('\n重置用法: node deploy/reset-password.js <username> <newPassword>');
  process.exit(0);
}

if (!newPassword) {
  console.error('缺少新密码参数');
  process.exit(1);
}

const hash = bcrypt.hashSync(newPassword, 10);
const r = db.prepare('UPDATE users SET password = ? WHERE username = ?').run(hash, username);

if (r.changes === 0) {
  console.error('未找到账号:', username);
  process.exit(1);
}
console.log('OK 已重置账号', username, '的密码（请用新密码登录）');
db.close();
