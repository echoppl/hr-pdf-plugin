const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'db', 'data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_size_readable TEXT NOT NULL,
      file_type TEXT DEFAULT 'application/pdf',
      cos_key TEXT NOT NULL,
      upload_time TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// ====== 用户操作 ======

function createUser(username, hashedPassword) {
  const id = uuidv4();
  const stmt = getDb().prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)');
  stmt.run(id, username, hashedPassword);
  return { id, username };
}

function findUserByUsername(username) {
  const stmt = getDb().prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

// ====== 文件操作 ======

function createFileRecord(userId, fileName, fileUrl, fileSize, fileSizeReadable, cosKey) {
  const id = uuidv4();
  const stmt = getDb().prepare(
    'INSERT INTO files (id, user_id, file_name, file_url, file_size, file_size_readable, cos_key) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(id, userId, fileName, fileUrl, fileSize, fileSizeReadable, cosKey);
  return getFileById(id);
}

function getFileById(id) {
  const stmt = getDb().prepare('SELECT * FROM files WHERE id = ?');
  return stmt.get(id);
}

function getFilesByUserId(userId) {
  const stmt = getDb().prepare(
    'SELECT * FROM files WHERE user_id = ? ORDER BY upload_time DESC'
  );
  return stmt.all(userId);
}

function getAllFiles() {
  const stmt = getDb().prepare(
    `SELECT f.*, u.username
     FROM files f
     JOIN users u ON f.user_id = u.id
     ORDER BY f.upload_time DESC`
  );
  return stmt.all();
}

function deleteFile(id, userId) {
  const stmt = getDb().prepare('DELETE FROM files WHERE id = ? AND user_id = ?');
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

module.exports = {
  getDb,
  createUser,
  findUserByUsername,
  createFileRecord,
  getFileById,
  getFilesByUserId,
  getAllFiles,
  deleteFile,
};
